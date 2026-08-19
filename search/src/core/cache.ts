// Copyright (C) 2026 Fiber
//
// This file is part of scribe and is made available under the PolyForm Shield
// License 1.0.0. The full terms are in the LICENSE file at the root of this
// repository, and at https://polyformproject.org/licenses/shield/1.0.0
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
//
// The one thing you may not do:
// - Use it to provide any product that competes with scribe, or with any
//   product Fiber or its affiliates provide using scribe. Products compete
//   even when they are offered free of charge, through a different kind of
//   interface, or for a different technical platform.
//
// If you pass this software on:
// - Anyone who receives any part of it from you must also receive these terms,
//   or the URL above, together with the "Required Notice" line carried by the
//   LICENSE file.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE COMES AS IS, WITHOUT ANY WARRANTY OR
// CONDITION, AND THE LICENSOR WILL NOT BE LIABLE TO YOU FOR ANY DAMAGES ARISING
// OUT OF THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY KIND OF
// LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

import { Time } from "@scribe/core/contracts/common/time.ts";
import { Valkery } from "@scribe/foundation/src/valkery/valkery.ts";

/** How long a result set and a preview are kept when a declaration asks for nothing else. */
export const DEFAULT_TTL: Time = Time.minutes(5);

/**
 * The two things one index caches: the pages it answered, and the previews it hydrated.
 *
 * @remarks
 * They are two namespaces because they are invalidated differently. A document that changes
 * makes its own preview wrong and every page that might have listed it stale, so writing one
 * document drops one preview and the whole page namespace. Keeping both under one key would
 * mean dropping every preview of the index each time any single row moved.
 */
export class SearchCache<TPreview> {
  readonly #pages: Valkery<unknown>;
  readonly #previews: Valkery<TPreview>;

  constructor(name: string, ttl: Time = DEFAULT_TTL) {
    this.#pages = new Valkery<unknown>({ key: `search:${name}:page`, ttl });
    this.#previews = new Valkery<TPreview>({ key: `search:${name}:item`, ttl });
  }

  /** What `key` holds, produced and kept when it holds nothing. */
  page<T>(key: string, produce: () => Promise<T>): Promise<T> {
    return this.#pages.upsert(key, produce) as Promise<T>;
  }

  /**
   * Drops the previews of `ids` and every page of this index, which a written document makes stale.
   *
   * The pages are cleared once for the whole batch rather than once per document, since the
   * namespace holds no page that survives the first clear anyway.
   */
  async invalidate(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await Promise.all([...ids.map((id) => this.#previews.delete(id)), this.#pages.clear()]);
  }

  /**
   * The previews of `ids`, taking from the cache what it holds and reading the rest once.
   *
   * @param read - Reads the previews the cache did not hold, in one call, keyed by identifier.
   * A missing identifier that comes back with no entry is a document whose row is gone, and it
   * is left out of the answer rather than cached as nothing.
   */
  async hydrate(
    ids: readonly string[],
    read: (missing: string[]) => Promise<ReadonlyMap<string, TPreview>>,
  ): Promise<Map<string, TPreview>> {
    const byId = new Map<string, TPreview>();
    const cached = await this.#previews.getMany([...ids]);

    const missing: string[] = [];
    cached.forEach((preview, i) => {
      if (preview !== null) byId.set(ids[i], preview);
      else missing.push(ids[i]);
    });

    if (missing.length === 0) return byId;

    const found = await read(missing);
    await Promise.all([...found].map(async ([id, preview]) => {
      byId.set(id, preview);
      await this.#previews.add(id, preview);
    }));

    return byId;
  }
}
