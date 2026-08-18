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

import { kv } from "@scribe/core/runtime/redis/mod.ts";
import { decodeEntry, encodeEntry, type Entry } from "./entry.ts";
import type { KeySpace } from "./key_space.ts";

/** How many keys one `SCAN` pass asks Redis to look at. */
const SCAN_COUNT = 500;

/** What a failed cache operation is reported as, so the caller can degrade instead of throw. */
export type StoreReporter = (operation: string, error: unknown) => void;

/**
 * Every Redis call a cache makes, and the one place they are allowed to fail.
 *
 * The class exists so that "a cache never breaks the request that used it" is written once
 * rather than in a `catch` per operation. Each method reports and falls back to the value a
 * miss would have produced, which is what makes the whole cache fail-open by construction.
 */
export class ValkeryStore {
  readonly #keys: KeySpace;
  readonly #report: StoreReporter;

  constructor(keys: KeySpace, report: StoreReporter) {
    this.#keys = keys;
    this.#report = report;
  }

  /** Reads one entry, or `null` when it is missing, unreadable, or Redis is down. */
  read<T>(id: string, ttlMs: number): Promise<Entry<T> | null> {
    return this.#guard("get", null, async () => {
      const raw = await kv().get(this.#keys.keyOf(id));
      return raw === null ? null : decodeEntry<T>(raw, ttlMs);
    });
  }

  /**
   * Reads several entries in a single round trip.
   *
   * The point of the method is that `MGET` costs one round trip where a loop over
   * {@link read} costs one per id. A caller that hydrates a page of search results reads
   * twenty keys, and the difference is twenty round trips against one.
   */
  readMany<T>(
    ids: readonly string[],
    ttlMs: number,
  ): Promise<(Entry<T> | null)[]> {
    if (ids.length === 0) return Promise.resolve([]);

    return this.#guard("mget", ids.map(() => null), async () => {
      const raws = await kv().mget(...ids.map((id) => this.#keys.keyOf(id)));
      return raws.map((raw) => (raw === null ? null : decodeEntry<T>(raw, ttlMs)));
    });
  }

  /** Writes one entry under a ttl already jittered by the caller. */
  write<T>(
    id: string,
    value: T,
    ttlSeconds: number,
    computeMs: number,
  ): Promise<void> {
    return this.#guard("set", undefined, async () => {
      await kv().setex(
        this.#keys.keyOf(id),
        ttlSeconds,
        encodeEntry(value, Date.now() + ttlSeconds * 1_000, computeMs),
      );
    });
  }

  /** Writes several entries in a single pipeline, each with its own jittered ttl. */
  writeMany<T>(
    entries: readonly [string, T][],
    ttlOf: () => number,
  ): Promise<void> {
    if (entries.length === 0) return Promise.resolve();

    return this.#guard("set", undefined, async () => {
      const pipeline = kv().pipeline();
      for (const [id, value] of entries) {
        const ttlSeconds = ttlOf();
        pipeline.setex(
          this.#keys.keyOf(id),
          ttlSeconds,
          encodeEntry(value, Date.now() + ttlSeconds * 1_000, 0),
        );
      }
      await pipeline.exec();
    });
  }

  /** Removes entries by id. */
  forget(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return Promise.resolve();

    return this.#guard("del", undefined, async () => {
      await kv().unlink(...ids.map((id) => this.#keys.keyOf(id)));
    });
  }

  /**
   * Removes every entry a glob matches.
   *
   * Two details decide what this costs the server. `SCAN` walks the whole keyspace whatever
   * the pattern — `MATCH` filters what it hands back, not what it visits — so the `COUNT`
   * is raised to cut the number of round trips that walk takes. And the removal is `UNLINK`
   * rather than `DEL`: it detaches the keys at once and frees the memory on a background
   * thread, where `DEL` would hold the single Redis thread for the length of the batch.
   */
  sweep(match: string): Promise<void> {
    return this.#guard("clear", undefined, async () => {
      let cursor = "0";
      do {
        const [next, keys] = await kv().scan(
          cursor,
          "MATCH",
          match,
          "COUNT",
          SCAN_COUNT,
        );
        cursor = next;
        if (keys.length > 0) await kv().unlink(...keys);
      } while (cursor !== "0");
    });
  }

  async #guard<T>(
    operation: string,
    fallback: T,
    call: () => Promise<T>,
  ): Promise<T> {
    try {
      return await call();
    } catch (error) {
      this.#report(operation, error);
      return fallback;
    }
  }
}
