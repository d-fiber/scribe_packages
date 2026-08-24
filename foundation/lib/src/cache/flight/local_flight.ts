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

import { DEFAULT_CACHE_DEADLINE, Duration } from "@scribe/alchemy";
import type { Future } from "@scribe/alchemy";

/**
 * Collapses concurrent computations of the same key inside one process.
 *
 * This is the first of the two tiers a cache needs. The Redis lock coordinates replicas
 * with each other and costs two round trips to do it; this one costs a `Map` lookup and
 * covers the case that dominates in practice: the same client, or the same page, asking for
 * the same key several times while the first answer is still in flight.
 *
 * Nothing here is a cache: an entry lives exactly as long as the computation it stands for,
 * so a caller never reads a value this class kept.
 */
export class LocalFlight {
  readonly #inFlight = new Map<string, Run>();

  /** How many computations are running right now. Exists for tests and for reporting. */
  get size(): number {
    return this.#inFlight.size;
  }

  /**
   * Runs `compute` for `key`, or joins the run already under way for it.
   *
   * A rejection is shared by every joiner, then forgotten: the next caller retries rather
   * than inheriting a failure it did not cause.
   *
   * @param within - The whole budget one call has, waiting and computing together. It defaults
   * to what a cache call is given, which is where every caller of this comes from. See
   * {@link _joinable} for who is attached to a run rather than starting one.
   */
  async run<T>(
    key: string,
    compute: () => Future<T>,
    within: Duration = DEFAULT_CACHE_DEADLINE,
  ): Future<T> {
    const running = this.#inFlight.get(key);

    if (running !== undefined && _joinable(running)) {
      const joined = await _boundedBy(running.answer as Promise<T>, within.inMilliseconds);
      if (joined !== _GAVE_UP) return joined;
    }

    const started: Run = { answer: Promise.resolve(compute()), startedAt: Date.now() };
    this.#inFlight.set(key, started);

    try {
      return await started.answer as T;
    } finally {
      if (this.#inFlight.get(key) === started) this.#inFlight.delete(key);
    }
  }
}

/** How late a caller may still attach itself to a computation already under way. */
const JOIN_WINDOW: Duration = Duration.milliseconds(50);

/**
 * Whether `running` is recent enough for a caller arriving now to attach itself to it.
 *
 * @remarks
 * This tier collapses a burst, which is the same client or the same page asking for one key
 * several times while the first answer is still in flight. A burst is milliseconds wide, and
 * what arrives later is a caller of its own: attaching it to a run that may never answer is how
 * a hung origin takes a key out of service long after it recovered. The Redis lock is what
 * collapses the callers this window does not.
 */
function _joinable(running: Run): boolean {
  return Date.now() - running.startedAt <= JOIN_WINDOW.inMilliseconds;
}

/**
 * One computation under way, and when it started.
 *
 * @remarks
 * The instant is what a joiner counts its wait from. Counted from the joiner's own arrival, a
 * key asked for again every hundred milliseconds would be waited on for ever: each joiner would
 * start a fresh budget on a run that has already outlived every earlier one.
 */
interface Run {
  /** What the computation will answer, shared by everybody waiting on it. */
  readonly answer: Promise<unknown>;

  /** When it started, on the process clock, as milliseconds since the epoch. */
  readonly startedAt: number;
}

/** What {@link _boundedBy} answers when the run it joined outlived the budget. */
const _GAVE_UP: unique symbol = Symbol("gave up");

/**
 * What `running` answered, or {@link _GAVE_UP} when it did not answer inside `leftMs`.
 *
 * @remarks
 * A joiner has to be able to leave. A computation that never answers, an origin hanging on a
 * socket with no timeout among them, would otherwise hold its key for the life of the process:
 * every later caller of that key joins the same dead run and never comes back, and the key stays
 * dead long after the origin recovered.
 *
 * The timer is cleared whichever way the race ends, so a run that answers on time leaves nothing
 * pending behind it.
 */
function _boundedBy<T>(running: Promise<T>, leftMs: number): Promise<T | typeof _GAVE_UP> {
  if (leftMs <= 0) return Promise.resolve(_GAVE_UP);

  return new Promise((answer, refuse) => {
    const timer = setTimeout(() => answer(_GAVE_UP), leftMs);
    running.then(
      (value) => {
        clearTimeout(timer);
        answer(value);
      },
      (raised: unknown) => {
        clearTimeout(timer);
        refuse(raised);
      },
    );
  });
}
