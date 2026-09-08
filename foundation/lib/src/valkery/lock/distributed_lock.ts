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

import { Duration, type Future } from "@scribe/alchemy";
import { kv } from "../../redis/kv.ts";
import { lockCommands } from "./lock_commands.ts";

/**
 * How long a lock is held when the caller named no budget of its own.
 *
 * @remarks
 * It is a floor and not a policy. What a lease should last is how long the work it protects may
 * run, and only the caller knows that, so {@link DistributedLock.acquire} takes it. This answers
 * when nothing was said, and it is short on purpose: a lease nobody can justify should expire
 * quickly rather than hold a key nobody is using.
 */
export const DEFAULT_LOCK_HOLD: Duration = Duration.seconds(5);

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
 * The token is what makes releasing safe. A holder that overran its lease no longer owns the key,
 * since another replica may have taken it, so releasing by key alone would free a lock somebody
 * else is relying on. See {@link lockCommands} for how the comparison and the removal are made
 * atomic.
 */
export class DistributedLock {
  readonly #onError: LockErrorReporter;

  constructor(onError: LockErrorReporter) {
    this.#onError = onError;
  }

  /**
   * Takes the lock if it is free, and says which of the three things happened.
   *
   * @param heldFor - How long the work this protects may run. It is the caller's quantity because
   * the caller is the only side that knows it: a lease shorter than the work frees the key while
   * it is still being used, and a lease longer holds it after the work has stopped. A constant
   * would be neither, which is why there is a parameter rather than a policy here.
   */
  async acquire(lockKey: string, heldFor: Duration = DEFAULT_LOCK_HOLD): Future<LockOutcome> {
    const token = crypto.randomUUID();

    try {
      const claimed = await kv().set(lockKey, token, "PX", heldFor.inMilliseconds, "NX");
      return claimed === "OK" ? { state: "acquired", token } : { state: "held" };
    } catch (error) {
      this.#onError("lock", error);
      return { state: "error" };
    }
  }

  /** Releases the lock, and does nothing when this token no longer owns it. */
  async release(lockKey: string, token: string): Future<void> {
    try {
      await lockCommands().releaseLock(lockKey, token);
    } catch (error) {
      this.#onError("unlock", error);
    }
  }
}
