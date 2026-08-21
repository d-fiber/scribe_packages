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

import { ExponentialBackoff } from "@scribe/core/runtime/support/async/backoff.ts";
import { sleep } from "@scribe/core/runtime/support/async/sleep.ts";

const RESTART_DELAY_MS = 5_000;
const PASS_BACKOFF_MS = 1_000;
const PASS_BACKOFF_MAX_MS = 30_000;

/** One turn of a loop. */
export type Pass = () => Promise<void>;
/** What runs once before the first turn. */
export type Prepare = () => Promise<void>;

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
  readonly #backoff = new ExponentialBackoff(
    PASS_BACKOFF_MS,
    PASS_BACKOFF_MAX_MS,
  );

  readonly #prepare: Prepare;

  constructor(
    label: string,
    pass: Pass,
    isRunning: () => boolean,
    prepare: Prepare = () => Promise.resolve(),
  ) {
    this.#label = label;
    this.#pass = pass;
    this.#isRunning = isRunning;
    this.#prepare = prepare;
  }

  start(): void {
    this.#drive().catch((error) => {
      console.error(
        `[queue-runner] loop "${this.#label}" crashed, restarting in ${RESTART_DELAY_MS}ms:`,
        error,
      );
      setTimeout(() => {
        if (this.#isRunning()) this.start();
      }, RESTART_DELAY_MS);
    });
  }

  async #drive(): Promise<void> {
    await this.#prepare();
    let consecutiveErrors = 0;

    while (this.#isRunning()) {
      try {
        await this.#pass();
        consecutiveErrors = 0;
      } catch (error) {
        consecutiveErrors++;
        console.error(`[queue-runner] pass failed for "${this.#label}"`, error);
        await sleep(this.#backoff.delayFor(consecutiveErrors));
      }
    }
  }
}
