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

import { nextRun, nextRunAfterSlot } from "@scribe/foundation/lib/src/cron/core/next_run.ts";
import type { CronHandler, Scheduled } from "@scribe/foundation/lib/src/cron/schedule/mod.ts";

/**
 * One armed job: its body, when it next runs, and whether it is running now.
 *
 * The run marker is a token rather than a boolean, and the difference matters. The `finally`
 * that frees a job can land **after** a newer occurrence has started, and a late finish that
 * cleared a boolean would free a slot it no longer owns, so two runs of the same job would
 * overlap. A token only frees what is still its own.
 */
export class ScheduledJob {
  readonly job: Scheduled;
  readonly handler: CronHandler;

  #nextRun: Date;
  #runToken = 0;

  constructor(job: Scheduled, handler: CronHandler, from: Date) {
    this.job = job;
    this.handler = handler;
    this.#nextRun = nextRun(job.schedule, from);
  }

  /** The job's name. */
  get name(): string {
    return this.job.name;
  }

  /** When this job next runs. */
  get nextRunAt(): Date {
    return this.#nextRun;
  }

  /** Whether an occurrence of this job is in flight. */
  get running(): boolean {
    return this.#runToken !== 0;
  }

  /** Whether its next occurrence has arrived. */
  isDue(now: Date): boolean {
    return now >= this.#nextRun;
  }

  /**
   * Takes the current occurrence and moves on to the next, in one call.
   *
   * Advancing here rather than at the end of the run is what makes taking the same
   * occurrence twice impossible.
   */
  takeSlot(now: Date): Date {
    const slot = this.#nextRun;
    this.#nextRun = nextRunAfterSlot(this.job.schedule, slot, now);
    return slot;
  }

  /** Marks the job as running under `token`. */
  beginRun(token: number): void {
    this.#runToken = token;
  }

  /** Frees the job, but only if `token` is still the one that took it. */
  endRun(token: number): void {
    if (this.#runToken === token) this.#runToken = 0;
  }
}
