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

import { KeyIndex } from "./key_index.ts";
import { kv } from "./kv.ts";

export const IDENTITY_CACHE_KEY = "identity:jwt";

/**
 * How long a revoked user keeps being re-checked against GoTrue.
 *
 * An identity is normally read from the token's own claims, which cannot
 * change once signed. After a revocation the claims of tokens already in the
 * wild are stale, so this marker forces those tokens back through GoTrue until
 * they expire. It must therefore outlive the longest access token GoTrue
 * issues, which `GOTRUE_JWT_EXP` sets to 3600 in
 * `packages/auth/ops/docker-compose.yaml`. Raise this to match if
 * that value ever grows: a window shorter than the token lifetime lets a
 * demoted account keep its old claims, while one that is too long only costs
 * an HTTP call per cache miss.
 */
const RECHECK_WINDOW_SECONDS = 3_600;

function _index(ttlSeconds: number): KeyIndex {
  return new KeyIndex(`${IDENTITY_CACHE_KEY}:index`, ttlSeconds, "identity-revocation");
}

function recheckKey(userId: string): string {
  return `${IDENTITY_CACHE_KEY}:recheck:${userId}`;
}

/** Tracks a user's live token fingerprints, so a revocation can force them back through GoTrue. */
export class IdentityRevocation {
  /**
   * Indexes `fingerprint` under `userId` for `ttlSeconds`, the token's own lifetime; `false` when
   * the index could not be written.
   *
   * @remarks
   * The index is built fresh on every call rather than held on the class, because the window a
   * fingerprint stays indexed for is the token's own: two tokens of the same user can expire at
   * different times, so there is no single TTL this class could cache one index under.
   */
  static async remember(
    userId: string,
    fingerprint: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    return await _index(ttlSeconds).remember(userId, fingerprint);
  }

  /**
   * Forgets every fingerprint indexed for `userId`, and marks the account for a re-check against
   * GoTrue until {@link RECHECK_WINDOW_SECONDS} has passed. Logs rather than throws on failure, so
   * a store outage never turns a revocation into an unhandled error.
   */
  static async revoke(userId: string): Promise<void> {
    try {
      const index = _index(RECHECK_WINDOW_SECONDS);
      const fingerprints = await index.members(userId);
      if (fingerprints.length > 0) {
        await kv().del(...fingerprints.map((f) => `${IDENTITY_CACHE_KEY}:${f}`));
      }
      await index.forget(userId);
      await kv().setex(recheckKey(userId), RECHECK_WINDOW_SECONDS, "1");
    } catch (e) {
      console.error("[identity-revocation] revoke failed:", e);
    }
  }

  /**
   * Whether this user's tokens must be resolved against GoTrue rather than
   * from their own claims.
   *
   * Fails closed: when Redis cannot answer, the caller is told to re-check, so
   * a revocation is never lost to an unavailable cache.
   */
  static async recheckRequired(userId: string): Promise<boolean> {
    try {
      return (await kv().exists(recheckKey(userId))) === 1;
    } catch (e) {
      console.error("[identity-revocation] recheck lookup failed:", e);
      return true;
    }
  }
}
