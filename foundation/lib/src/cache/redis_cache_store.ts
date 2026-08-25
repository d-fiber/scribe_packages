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

import { DateTime, Duration, type Future, type UnmodifiableList } from "@scribe/alchemy";
import { kv } from "../redis/kv.ts";
import { type CacheEntry, decodeCacheEntry, encodeCacheEntry } from "./cache_entry.ts";
import type { KeySpace } from "./key_space.ts";

/** How many keys one `SCAN` pass asks Redis to look at. */
const SCAN_COUNT = 500;

/** What a failed cache operation is reported as, so the caller can degrade instead of throw. */
export type CacheStoreReporter = (operation: string, error: unknown) => void;

/**
 * Every Redis call a cache makes, and the one place they are allowed to fail.
 *
 * The class exists so that "a cache never breaks the request that used it" is written once
 * rather than in a `catch` per operation. Each method reports and falls back to the value a
 * miss would have produced, which is what makes the whole cache fail-open by construction.
 */
export class RedisCacheStore {
  readonly #keys: KeySpace;
  readonly #report: CacheStoreReporter;

  constructor(keys: KeySpace, report: CacheStoreReporter) {
    this.#keys = keys;
    this.#report = report;
  }

  /** Reads one entry, or `null` when it is missing, unreadable, or Redis is down. */
  read<T>(id: string, ttlMs: number): Future<CacheEntry<T> | null> {
    return this.#guard("get", _null, async () => {
      const raw = await kv().get(this.#keys.keyOf(id));
      return raw === null ? null : decodeCacheEntry<T>(raw, ttlMs);
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
    ids: UnmodifiableList<string>,
    ttlMs: number,
  ): Future<(CacheEntry<T> | null)[]> {
    if (ids.length === 0) return Promise.resolve([]);

    return this.#guard("mget", () => ids.map(() => null), async () => {
      const raws = await kv().mget(...ids.map((id) => this.#keys.keyOf(id)));
      return raws.map((raw) => (raw === null ? null : decodeCacheEntry<T>(raw, ttlMs)));
    });
  }

  /** Writes one entry under a ttl already jittered by the caller. */
  write<T>(
    id: string,
    value: T,
    ttlSeconds: number,
    computeMs: number,
  ): Future<void> {
    return this.#guard("set", _nothing, async () => {
      const held = _wholeSeconds(ttlSeconds);
      await kv().setex(
        this.#keys.keyOf(id),
        held,
        encodeCacheEntry(value, _expiryAfter(held), computeMs),
      );
    });
  }

  /** Writes several entries in a single pipeline, each with its own jittered ttl. */
  writeMany<T>(
    entries: readonly [string, T][],
    ttlOf: () => number,
  ): Future<void> {
    if (entries.length === 0) return Promise.resolve();

    return this.#guard("set", _nothing, async () => {
      const pipeline = kv().pipeline();
      for (const [id, value] of entries) {
        const held = _wholeSeconds(ttlOf());
        pipeline.setex(
          this.#keys.keyOf(id),
          held,
          encodeCacheEntry(value, _expiryAfter(held), 0),
        );
      }
      await pipeline.exec();
    });
  }

  /** Removes entries by id. */
  forget(ids: UnmodifiableList<string>): Future<void> {
    if (ids.length === 0) return Promise.resolve();

    return this.#guard("del", _nothing, async () => {
      await kv().unlink(...ids.map((id) => this.#keys.keyOf(id)));
    });
  }

  /**
   * Removes every entry a glob matches.
   *
   * Two details decide what this costs the server. `SCAN` walks the whole keyspace whatever the
   * pattern, since `MATCH` filters what it hands back and not what it visits, so the `COUNT` is
   * raised to cut the number of round trips that walk takes. And the removal is `UNLINK`
   * rather than `DEL`: it detaches the keys at once and frees the memory on a background
   * thread, where `DEL` would hold the single Redis thread for the length of the batch.
   */
  sweep(match: string): Future<void> {
    return this.#guard("clear", _nothing, async () => {
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

  /**
   * Runs `call`, and answers what `fallback` builds when the store refuses.
   *
   * @remarks
   * The fallback is built only when it is needed. It used to be an argument, which meant a batch
   * read of two hundred ids walked its ids a second time and allocated two hundred nulls on every
   * call, for an answer that is thrown away whenever Redis is up.
   */
  async #guard<T>(
    operation: string,
    fallback: () => T,
    call: () => Future<T>,
  ): Future<T> {
    try {
      return await call();
    } catch (error) {
      this.#report(operation, error);
      return fallback();
    }
  }
}

/** When an entry written now, under `ttlSeconds`, stops being readable. */
function _expiryAfter(ttlSeconds: number): number {
  return DateTime.now().add(Duration.seconds(ttlSeconds)).millisecondsSinceEpoch;
}

/**
 * How long a key is held, in the whole seconds `SETEX` takes.
 *
 * @remarks
 * Redis answers "value is not an integer or out of range" to anything else, so a ttl of a second
 * and a half used to fail every write of that cache: nothing was ever stored, every read was a
 * miss, and every upsert recomputed and took a lock. Rounding up is what keeps a sub-second ttl
 * a cache rather than an outage, and the envelope is dated from the same number so the two agree.
 */
function _wholeSeconds(ttlSeconds: number): number {
  return Math.max(1, Math.ceil(ttlSeconds));
}

/** What a write answers when the store refused it, which is nothing. */
function _nothing(): undefined {
  return undefined;
}

/** What a read of one key answers when the store refused it, which is a miss. */
function _null(): null {
  return null;
}
