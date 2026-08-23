// Copyright (C) 2026 Fiber
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0. If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
// - Combine it with files under any other licence, proprietary ones included,
//   and licence that larger work on your own terms.
//
// What you must do in return:
// - Keep this notice on every file you received it on.
// - Publish, under these same terms, the source of every file covered by them
//   that you distribute, including the ones you changed, so that whoever
//   receives your version can obtain that source.
// - Leave Fiber out of it: the name "Fiber", its branding, its logos and its
//   trademarks may not be used to endorse or promote what you build, and this
//   licence grants no right to them.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
// OR CONDITION OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
// NON-INFRINGEMENT. IN NO EVENT SHALL FIBER BE LIABLE FOR ANY DIRECT, INDIRECT,
// INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING BUT NOT
// LIMITED TO LOSS OF USE, DATA, PROFITS, OR BUSINESS INTERRUPTION) ARISING OUT
// OF OR RELATED TO THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY
// KIND OF LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

import type { Duration } from "@scribe/alchemy";
import { Pagination } from "@scribe/alchemy";
import { Failure, Ok, type Result } from "@scribe/alchemy";
import type {
  IndexConfig,
  IndexSettings,
  QueryPlan,
  Search,
  SearchParams,
  SearchSource,
} from "../../contracts/definition.ts";
import { SearchOperation } from "../../contracts/definition.ts";
import type { IndexedDocument } from "../../contracts/transport.ts";
import { enqueue } from "../db/outbox.ts";
import { projectRows } from "../db/source.ts";
import type { CompiledPreview } from "../document/preview.ts";
import { type CompiledDocument, readDocument } from "../document/projection.ts";
import { searchTransport } from "../transport/registry.ts";
import { SearchCache } from "./cache.ts";
import { stableKey } from "./cache_key.ts";

/** One declaration, once every builder step has been walked and compiled. */
export interface ResolvedIndex<TParams extends SearchParams, TPreview> {
  /** The name this index is declared under, which is what the outbox addresses. */
  readonly name: string;

  /** The index in the cluster, which a rebuild lets differ from the declared name. */
  readonly index: string;

  /** The table the index is declared on. */
  readonly table: string;

  /** The column of that table identifying one document. */
  readonly key: string;

  /** The select list, the mapping, the tables to watch and the text fields, from one walk. */
  readonly document: CompiledDocument;

  /** The select list a preview reads, and the reshaping that follows it. */
  readonly preview: CompiledPreview;

  /** The analysis the index is created with. */
  readonly settings: IndexSettings;

  /** How many results a page holds when the caller asks for no size. */
  readonly pageSize: number;

  /** How long a page and a preview are kept. */
  readonly ttl: Duration;

  /** What one set of parameters compiles into. */
  readonly plan: (params: TParams) => QueryPlan;
}

/**
 * One declared index: the three verbs a project calls, and what the drain reaches it by.
 *
 * @remarks
 * A project holds it as a `Search`, which is three verbs and a plan. The rest of this class is
 * what the outbox drain and the boot-time synchronisation call, and it is not on that
 * interface: an index is written to by the drain, in one place, from what the outbox says, and
 * a project that could write to it directly would be indexing outside the transaction that
 * changed the row.
 *
 * It is safe to keep at module scope. It holds no client and no identity, and the cache it
 * carries builds its own connection at the first call.
 */
export class SearchIndex<TParams extends SearchParams, TPreview> implements Search<TParams, TPreview> {
  /** The name this index is declared under. */
  readonly name: string;

  /** The index in the cluster this declaration writes into. */
  readonly index: string;

  /** The table this index is declared on. */
  readonly table: string;

  /** The column of that table identifying one document. */
  readonly key: string;

  readonly #resolved: ResolvedIndex<TParams, TPreview>;
  readonly #cache: SearchCache<TPreview>;

  constructor(resolved: ResolvedIndex<TParams, TPreview>) {
    this.name = resolved.name;
    this.index = resolved.index;
    this.table = resolved.table;
    this.key = resolved.key;
    this.#resolved = resolved;
    this.#cache = new SearchCache<TPreview>(resolved.name, resolved.ttl);
  }

  /** Every table feeding this index, the one it is declared on first. */
  get sources(): readonly SearchSource[] {
    return this.#resolved.document.sources;
  }

  /** Everything the cluster needs to hold this declaration's documents. */
  config(): IndexConfig {
    return {
      settings: this.#resolved.settings,
      mappings: { properties: this.#resolved.document.mappings },
    };
  }

  /** Queues the document `id` for a rebuild, and answers whether the request was recorded. */
  add(id: string): Promise<boolean> {
    return enqueue(this.name, [id], SearchOperation.Index);
  }

  /** Queues every identifier of `ids` for a rebuild, in one write. */
  addMany(ids: readonly string[]): Promise<boolean> {
    return enqueue(this.name, ids, SearchOperation.Index);
  }

  /** Queues the document `id` for removal, and answers whether the request was recorded. */
  delete(id: string): Promise<boolean> {
    return enqueue(this.name, [id], SearchOperation.Delete);
  }

  /** The plan `params` compiles into, without reaching the cluster. */
  plan(params: TParams): QueryPlan {
    return this.#resolved.plan(params);
  }

  /**
   * Answers the page of previews `params` asks for.
   *
   * @remarks
   * The page is cached under its compiled plan and not under its parameters, because the plan
   * is what decides the answer. Two sets of parameters a declaration deliberately narrows onto
   * one plan therefore share one entry: a coordinate rounded by `roundCoord` and a moment
   * rounded by `timeBucket` are what make a search over a place or a period cacheable at all,
   * and both are written inside the declaration's own query.
   */
  async search(params: TParams): Promise<Result<Pagination<TPreview>, void>> {
    const from = params.page?.from ?? 0;
    const size = params.page?.size ?? this.#resolved.pageSize;
    const plan = this.plan(params);

    try {
      const page = await this.#cache.page(stableKey({ plan, from, size }), () => this.#answer(plan, from, size));
      return new Ok(page);
    } catch (error) {
      console.error(`[search:${this.name}] the page could not be answered.`, error);
      return new Failure(undefined);
    }
  }

  /**
   * Builds the documents `ids` name from their tables, writes them, and answers the ones that
   * reached the cluster.
   *
   * An identifier whose row is gone is removed from the index instead of being rebuilt. Its
   * row was read after the outbox line was written, so a document deleted between the two
   * would otherwise be retried until it ran out of attempts and stayed in the index for good.
   *
   * A batch the cluster only partly took answers nothing at all, since a bulk call reports a
   * count and not which lines it refused. The whole batch is then drained again, and writing a
   * document that is already there is what an index call does anyway.
   */
  async rebuild(ids: readonly string[]): Promise<readonly string[]> {
    const transport = searchTransport();
    if (transport === null || ids.length === 0) return [];

    const rows = await projectRows(this.table, this.key, this.#resolved.document.columns, ids);
    const documents: IndexedDocument[] = [];
    const built = new Set<string>();

    for (const row of rows) {
      const id = this.#identifierOf(row);
      if (id === null) continue;

      built.add(id);
      documents.push({ id, source: readDocument(this.#resolved.document.shape, row) });
    }

    const gone = ids.filter((id) => !built.has(id));
    const handled: string[] = [];

    if (documents.length > 0 && await transport.index(this.index, documents) === documents.length) {
      handled.push(...documents.map((one) => one.id));
    }

    if (gone.length > 0 && await transport.remove(this.index, gone) === gone.length) {
      handled.push(...gone);
    }

    await this.#cache.invalidate(handled);
    return handled;
  }

  /** Takes `ids` out of the index, and answers the ones that left. */
  async erase(ids: readonly string[]): Promise<readonly string[]> {
    const transport = searchTransport();
    if (transport === null || ids.length === 0) return [];

    const removed = await transport.remove(this.index, ids) === ids.length ? [...ids] : [];
    await this.#cache.invalidate(removed);

    return removed;
  }

  /**
   * The page `plan` matches, read from the cluster and hydrated.
   *
   * @throws {Error} When no transport is registered, or when the cluster did not answer. It
   * throws rather than answering an empty page because the answer would be cached, and an
   * outage that lasted a second would then be served for as long as a page is kept.
   */
  async #answer(plan: QueryPlan, from: number, size: number): Promise<Pagination<TPreview>> {
    const transport = searchTransport();
    if (transport === null) throw new Error(`search index "${this.name}" has no transport to ask.`);

    const hits = await transport.search({ index: this.index, plan, key: this.key, from, size });

    if (hits === null) throw new Error(`search index "${this.name}" was not answered by the cluster.`);

    if (hits.ids.length === 0) {
      return Pagination.of([], from, 0);
    }

    const byId = await this.#cache.hydrate(hits.ids, (missing) => this.#previewsOf(missing));
    const items = hits.ids
      .map((id) => byId.get(id))
      .filter((preview): preview is TPreview => preview !== undefined);

    const offset = from + items.length;
    return Pagination.of(items, offset, items.length);
  }

  /** The previews of `ids`, read in one call and keyed by identifier. */
  async #previewsOf(ids: readonly string[]): Promise<ReadonlyMap<string, TPreview>> {
    const rows = await projectRows(this.table, this.key, this.#resolved.preview.columns, ids);
    const byId = new Map<string, TPreview>();

    for (const row of rows) {
      const id = this.#identifierOf(row);
      if (id !== null) byId.set(id, this.#resolved.preview.build(row) as TPreview);
    }

    return byId;
  }

  /**
   * The identifier `row` carries, or null when it carries none.
   *
   * The outbox holds identifiers as text whatever the column is, so a key that comes back as a
   * number is written the same way here rather than missing every lookup.
   */
  #identifierOf(row: Record<string, unknown>): string | null {
    const value = row[this.key];
    if (value === null || value === undefined) return null;

    const id = String(value);
    return id.length === 0 ? null : id;
  }
}
