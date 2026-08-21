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

import { kv } from "@scribe/foundation/src/redis/mod.ts";
import { lockCommands } from "./release_script.ts";

/**
 * How long a lock survives its holder.
 *
 * It bounds the damage a replica that dies mid-computation does: the key expires on its own
 * and the next reader gets its turn, rather than the entry staying uncomputable forever.
 */
export const LOCK_TTL_MS = 5_000;

/**
 * What came of trying to take a lock.
 *
 * `held` and `error` are kept apart because they call for opposite reactions. Someone else is
 * computing, so wait; Redis is unreachable, so stop coordinating and compute.
 */
export type LockOutcome =
  | { readonly state: "acquired"; readonly token: string }
  | { readonly state: "held" }
  | { readonly state: "error" };

/** Reports a lock operation that failed, so the caller can degrade instead of throw. */
export type LockErrorReporter = (operation: string, error: unknown) => void;

/**
 * A lock one replica of a fleet holds while it computes an entry.
 *
 * The token is what makes releasing safe. A holder that overran {@link LOCK_TTL_MS} no longer
 * owns the key, since another replica may have taken it, so releasing by key alone would free a
 * lock somebody else is relying on. See {@link lockCommands} for how the comparison
 * and the removal are made atomic.
 */
export class DistributedLock {
  readonly #onError: LockErrorReporter;

  constructor(onError: LockErrorReporter) {
    this.#onError = onError;
  }

  /** Takes the lock if it is free, and says which of the three things happened. */
  async acquire(lockKey: string): Promise<LockOutcome> {
    const token = crypto.randomUUID();

    try {
      const claimed = await kv().set(lockKey, token, "PX", LOCK_TTL_MS, "NX");
      return claimed === "OK" ? { state: "acquired", token } : { state: "held" };
    } catch (error) {
      this.#onError("lock", error);
      return { state: "error" };
    }
  }

  /** Releases the lock, and does nothing when this token no longer owns it. */
  async release(lockKey: string, token: string): Promise<void> {
    try {
      await lockCommands().releaseLock(lockKey, token);
    } catch (error) {
      this.#onError("unlock", error);
    }
  }
}
