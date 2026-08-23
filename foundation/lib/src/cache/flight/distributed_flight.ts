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

import type { DistributedLock } from "../lock/distributed_lock.ts";
import { DateTime, Duration, Future } from "@scribe/alchemy";

/** How long a loser waits between two read-backs. */
const POLL_EVERY: Duration = Duration.milliseconds(50);

/** Reads back what the replica that won the lock wrote, or `null` while it has not. */
export type ReadBack<out T> = () => Future<T | null>;

/**
 * Coordinates the replicas of a fleet so one of them produces a missing value.
 *
 * This is the second of the two tiers a cache needs. The local tier, in `flight/local.ts`, has
 * already collapsed everything this process asked for, so what arrives here is one computation
 * per replica per key, and a Redis lock decides which replica pays for it.
 *
 * `compute` is what writes the value. This class only says who runs it and when, which is
 * what lets the caller decide the shape of what gets stored without telling this class.
 */
export class DistributedFlight {
  readonly #lock: DistributedLock;
  readonly #onGaveUp: (id: string) => void;

  constructor(lock: DistributedLock, onGaveUp: (id: string) => void) {
    this.#lock = lock;
    this.#onGaveUp = onGaveUp;
  }

  /**
   * Runs `compute` if this replica wins the lock, otherwise waits for whoever did.
   *
   * A loser polls `readBack` rather than the lock, because what it wants is the value and
   * not the turn. When nothing shows up before the deadline, whether from a holder that died or
   * one slower than the lock's own ttl, it computes without the lock: a duplicated computation
   * costs less than a request that never returns.
   *
   * @param within - How long the caller is prepared to wait, and the whole of what bounds this
   * loop. It is the caller's budget and not the winner's lease: whoever is waiting decides how
   * long waiting is worth it, and a lease says how long a holder may keep a key, which is a
   * different quantity. Deriving one from the other leaves a loop nobody waits for still running
   * once the caller has been answered.
   */
  async run<T>(
    id: string,
    lockKey: string,
    readBack: ReadBack<T>,
    compute: () => Future<T>,
    within: Duration,
  ): Future<T> {
    const deadline = DateTime.now().add(within);

    while (DateTime.now().isBefore(deadline)) {
      const lock = await this.#lock.acquire(lockKey, within);
      if (lock.state === "error") break;

      if (lock.state === "acquired") {
        try {
          return await compute();
        } finally {
          await this.#lock.release(lockKey, lock.token);
        }
      }

      await Future.delayed(POLL_EVERY);
      const written = await readBack();
      if (written !== null) return written;
    }

    this.#onGaveUp(id);
    return compute();
  }

  /**
   * Runs `compute` only if this replica wins the lock right now, and gives up otherwise.
   *
   * This is the refresh-ahead path, and it is the opposite trade of {@link run}: the caller
   * still holds a value that has not expired, so waiting for the winner would add latency to
   * a request that needed none. A loser is told `null` and serves what it already has.
   */
  async attempt<T>(
    lockKey: string,
    compute: () => Future<T>,
  ): Future<T | null> {
    const lock = await this.#lock.acquire(lockKey);
    if (lock.state !== "acquired") return null;

    try {
      return await compute();
    } finally {
      await this.#lock.release(lockKey, lock.token);
    }
  }
}
