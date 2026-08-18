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

import { ExponentialBackoff } from "@scribe/core/runtime/support/async/backoff.ts";
import { sleep } from "@scribe/core/runtime/support/async/sleep.ts";

const RESTART_DELAY_MS = 5_000;
const PASS_BACKOFF_MS = 1_000;
const PASS_BACKOFF_MAX_MS = 30_000;

export type Pass = () => Promise<void>;
export type Prepare = () => Promise<void>;

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
