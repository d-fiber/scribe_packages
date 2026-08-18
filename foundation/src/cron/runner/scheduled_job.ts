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

import { nextRun, nextRunAfterSlot } from "@scribe/foundation/src/cron/core/next_run.ts";
import type { CronHandler, Scheduled } from "@scribe/foundation/src/cron/schedule/mod.ts";

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
