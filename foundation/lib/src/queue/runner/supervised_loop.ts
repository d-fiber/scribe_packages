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

import { Duration, ExponentialBackoff, Future } from "@scribe/alchemy";
import { log } from "@scribe/alchemy/observe";

/** How long a crashed loop stays down before it comes back. */
const RESTART_AFTER: Duration = Duration.seconds(5);

/** How long the first failed pass waits before the next one. */
const BACKOFF_FROM: Duration = Duration.seconds(1);

/** The ceiling the doubling stops at, so a long outage does not push a retry an hour away. */
const BACKOFF_UP_TO: Duration = Duration.seconds(30);

/** One turn of a loop: a fetch and a dispatch, for a `SupervisedLoop` to call again and again. */
export type Pass = () => Future<void>;

/** What runs once before the first turn, `ensureTopology` for a `QueueRunner`'s own loops, so a pass never has to check the topology exists on every call. */
export type Prepare = () => Future<void>;

/**
 * Runs a pass over and over, backs off when it fails, and restarts when it dies.
 *
 * A queue loop that stops on an error stops for good and nothing says so, which is why the
 * supervision is here rather than in each caller.
 */
export class SupervisedLoop {
  readonly #label: string;
  readonly #pass: Pass;
  readonly #isRunning: () => boolean;
  readonly #backoff = new ExponentialBackoff(BACKOFF_FROM, BACKOFF_UP_TO);

  readonly #prepare: Prepare;

  constructor(
    label: string,
    pass: Pass,
    isRunning: () => boolean,
    prepare: Prepare = () => Future.value(undefined),
  ) {
    this.#label = label;
    this.#pass = pass;
    this.#isRunning = isRunning;
    this.#prepare = prepare;
  }

  /**
   * Runs `prepare`, then this loop's pass over and over until `isRunning` says to stop.
   *
   * @remarks
   * A crash restarts the whole loop after {@link RESTART_AFTER}, logged, rather than propagating
   * and taking the process down with it: a queue loop that stops on an error stops for good, and
   * nothing else would say so.
   */
  start(): void {
    this.#drive().catch((error) => {
      log.error("queue-runner.loop_crashed", {
        metadata: { loop: this.#label, restartingIn: RESTART_AFTER.toString(), error },
      });
      Future.delayed(RESTART_AFTER).then(() => {
        if (this.#isRunning()) this.start();
      });
    });
  }

  async #drive(): Future<void> {
    await this.#prepare();
    let consecutiveErrors = 0;

    while (this.#isRunning()) {
      try {
        await this.#pass();
        consecutiveErrors = 0;
      } catch (error) {
        consecutiveErrors++;
        log.error("queue-runner.pass_failed", { metadata: { loop: this.#label, error } });
        await Future.delayed(this.#backoff.delayFor(consecutiveErrors));
      }
    }
  }
}
