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

import { withDeadline } from "@scribe/core/runtime/support/async/deadline.ts";
import { Semaphore } from "@scribe/core/runtime/support/async/semaphore.ts";
import { sleep } from "@scribe/core/runtime/support/async/sleep.ts";
import type {
  CronHandler,
  Scheduled,
} from "@scribe/foundation/src/cron/schedule.ts";
import { ScheduledJob } from "./scheduled_job.ts";
import { SlotLock } from "./slot_lock.ts";

const DEFAULT_TICK_MS = 30_000;
const LOOP_RESTART_DELAY_MS = 5_000;
const MIN_SLEEP_MS = 50;
const DEFAULT_MAX_CONCURRENT = 20;

export class CronRunner {
  readonly #jobs = new Map<string, ScheduledJob>();
  readonly #lock = new SlotLock();

  #gate = new Semaphore(DEFAULT_MAX_CONCURRENT);
  #running = false;
  #runTokenCounter = 0;

  register(job: Scheduled, handler: CronHandler): void {
    if (this.#jobs.has(job.name)) {
      throw new Error(
        `CronRunner.register(): "${job.name}" is already registered`,
      );
    }
    this.#jobs.set(job.name, new ScheduledJob(job, handler, new Date()));
  }

  jobs(): readonly Scheduled[] {
    return [...this.#jobs.values()].map((scheduled) => scheduled.job);
  }

  start(
    tickMs = DEFAULT_TICK_MS,
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
  ): void {
    if (this.#running) return;

    this.#running = true;
    this.#gate = new Semaphore(maxConcurrent);

    this.#loop(tickMs).catch(() => {
      this.#running = false;
      setTimeout(() => this.start(tickMs, maxConcurrent), LOOP_RESTART_DELAY_MS);
    });
  }

  stop(): void {
    this.#running = false;
  }

  async #loop(tickMs: number): Promise<void> {
    while (this.#running) {
      const now = new Date();

      for (const scheduled of this.#jobs.values()) {
        if (scheduled.isDue(now)) this.#fire(scheduled, scheduled.takeSlot(now));
      }

      await sleep(this.#sleepFor(tickMs));
    }
  }

  #sleepFor(maxMs: number): number {
    let earliest = Number.POSITIVE_INFINITY;
    for (const scheduled of this.#jobs.values()) {
      earliest = Math.min(earliest, scheduled.nextRunAt.getTime());
    }

    if (!Number.isFinite(earliest)) return maxMs;
    return Math.min(maxMs, Math.max(MIN_SLEEP_MS, earliest - Date.now()));
  }

  #fire(scheduled: ScheduledJob, slot: Date): void {
    if (scheduled.running) return;

    const token = ++this.#runTokenCounter;
    scheduled.beginRun(token);

    this.#execute(scheduled, slot).finally(() => scheduled.endRun(token));
  }

  #execute(scheduled: ScheduledJob, slot: Date): Promise<void> {
    return this.#gate.run(async () => {
      try {
        if (!(await this.#lock.claim(scheduled.job, slot))) return;

        await withDeadline(
          `cron:${scheduled.name}`,
          scheduled.job.timeout.ms,
          Promise.resolve(scheduled.handler()),
        );
      } catch (error) {
        console.error(`[cron-runner] "${scheduled.name}" failed:`, error);
      }
    });
  }
}

export const cronRunner: CronRunner = new CronRunner();
