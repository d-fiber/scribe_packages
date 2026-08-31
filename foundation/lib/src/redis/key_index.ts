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

import { kv } from "./kv.ts";

/**
 * A Redis set that names the cache entries belonging to one subject.
 *
 * It exists because `clear(pattern)` walks the whole keyspace whatever the pattern, so a cache
 * that has to drop everything held for one user reads the set instead of scanning. Every
 * operation is fail-soft: an index that cannot answer costs a stale entry, and no caller of a
 * cache should fail because its bookkeeping did.
 *
 * The expiry is re-armed on every write, so the index never outlives the entries it points at.
 * An index key written without one would stay behind forever.
 */
export class KeyIndex {
  readonly #prefix: string;
  readonly #ttlSeconds: number;
  readonly #scope: string;

  constructor(prefix: string, ttlSeconds: number, scope: string) {
    this.#prefix = prefix;
    this.#ttlSeconds = ttlSeconds;
    this.#scope = scope;
  }

  /** The key this index lives under for `subject`. */
  keyOf(subject: string): string {
    return `${this.#prefix}:${subject}`;
  }

  /** Adds `entry` to the index of `subject`, and re-arms the expiry. */
  async remember(subject: string, entry: string): Promise<boolean> {
    try {
      const key = this.keyOf(subject);
      await kv().sadd(key, entry);
      await kv().expire(key, this.#ttlSeconds);
      return true;
    } catch (e) {
      console.error(`[${this.#scope}] index failed:`, e);
      return false;
    }
  }

  /** Everything indexed for `subject`, or nothing when the index cannot answer. */
  async members(subject: string): Promise<string[]> {
    try {
      return await kv().smembers(this.keyOf(subject));
    } catch (e) {
      console.error(`[${this.#scope}] index read failed:`, e);
      return [];
    }
  }

  /** Drops the index of `subject`, leaving what it pointed at to its own expiry. */
  async forget(subject: string): Promise<void> {
    try {
      await kv().del(this.keyOf(subject));
    } catch (e) {
      console.error(`[${this.#scope}] index clear failed:`, e);
    }
  }
}
