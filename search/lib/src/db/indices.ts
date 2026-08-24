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

import { digest } from "../core/cache_key.ts";
import type { AnySearchIndex } from "../core/registry.ts";
import { declaredIndices } from "../core/registry.ts";
import { searchTransport } from "../transport/registry.ts";
import { searchIndices, searchSources } from "./tables.ts";

/** The table and the column that identify one feeding source, joined so a set can hold the pair. */
function pairOf(table: string, key: string): string {
  return `${table} ${key}`;
}

/**
 * Makes the cluster and the stored record match what the declarations say.
 *
 * @remarks
 * It is what turns a document declared in TypeScript into an index the cluster holds, and
 * `register.ts` runs it once the process is up rather than at import, since a declaration
 * lives at module scope and neither the cluster nor the database is reachable when one is
 * evaluated.
 *
 * Nothing is sent when the digests of a declaration match what `__search_indices__` says the
 * cluster was last told. That is the whole reason the row exists: making an index match costs
 * a close and an open when the analysis changed, which stops every search against it for as
 * long as it takes, and doing that on each of a dozen replicas at each boot would take the
 * fleet's search down at every deployment.
 *
 * A cluster that refuses is left recorded as it was, so the next boot tries again rather than
 * the row claiming a shape the cluster does not hold.
 */
export async function syncDeclaredIndices(): Promise<void> {
  for (const index of declaredIndices()) {
    await syncIndex(index);
    await syncSources(index);
  }
}

/** Makes the cluster hold `index` as its declaration describes it, and records what it was told. */
async function syncIndex(index: AnySearchIndex): Promise<void> {
  const config = index.config();
  const mappings_hash = digest(config.mappings);
  const settings_hash = digest(config.settings ?? {});

  const stored = await searchIndices()
    .where((f) => f.name.eq(index.name))
    .getOne();

  const matches = stored !== null &&
    stored.index_name === index.index &&
    stored.mappings_hash === mappings_hash &&
    stored.settings_hash === settings_hash;

  if (matches) return;

  const transport = searchTransport();
  if (transport === null) return;
  if (!await transport.ensure(index.index, config)) return;

  const row = {
    name: index.name,
    index_name: index.index,
    source_table: index.table,
    source_key: index.key,
    mappings_hash,
    settings_hash,
    synced_at: new Date().toISOString(),
  };

  if (stored === null) {
    await searchIndices().insert(row);
    return;
  }

  await searchIndices()
    .where((f) => f.name.eq(index.name))
    .update(row);
}

/**
 * Makes `__search_sources__` list exactly the tables `index` is fed by.
 *
 * @remarks
 * The table is what a project reads to know which triggers a declaration asks for, and a row
 * that disappears is a trigger that has to be dropped. This package writes no DDL of its own,
 * so the correspondence is the whole of what it can say about it: a folded relation a
 * declaration stops reading would otherwise keep enqueueing rebuilds for a field nobody
 * indexes any more, and nothing would say which trigger was doing it.
 */
async function syncSources(index: AnySearchIndex): Promise<void> {
  const declared = new Map(index.sources.map((source) => [pairOf(source.table, source.key), source]));

  const stored = await searchSources()
    .where((f) => f.index.eq(index.name))
    .get();

  const held = new Set(stored.map((row) => pairOf(row.source_table, row.source_key)));

  const added = [...declared]
    .filter(([pair]) => !held.has(pair))
    .map(([, source]) => ({ index: index.name, source_table: source.table, source_key: source.key }));

  if (added.length > 0) await searchSources().insert(added);

  for (const row of stored) {
    if (declared.has(pairOf(row.source_table, row.source_key))) continue;

    await searchSources()
      .where((f) => [
        f.index.eq(index.name),
        f.source_table.eq(row.source_table),
        f.source_key.eq(row.source_key),
      ])
      .delete();
  }
}
