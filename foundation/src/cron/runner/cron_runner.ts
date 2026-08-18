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
import type { CronHandler, Scheduled } from "@scribe/foundation/src/cron/schedule/mod.ts";
import { ScheduledJob } from "./scheduled_job.ts";
import { SlotLock } from "./slot_lock.ts";

/** The longest the loop sleeps, however far away the next occurrence is. */
const DEFAULT_TICK_MS = 30_000;
const LOOP_RESTART_DELAY_MS = 5_000;
/** The shortest, so a schedule that is always due cannot spin the loop. */
const MIN_SLEEP_MS = 50;
const DEFAULT_MAX_CONCURRENT = 20;

/**
 * The loop that fires the declared jobs, and the three guards that keep one occurrence to
 * one execution.
 *
 * The guards do not protect against the same thing, which is why there are three:
 *
 * | Guard | Scope | Against |
 * | --- | --- | --- |
 * | the run token of {@link ScheduledJob} | one replica | an occurrence starting while the previous one of that job still runs |
 * | {@link SlotLock} | every replica | two replicas reaching the same occurrence together |
 * | the semaphore | one replica | twenty jobs striking the same minute and swamping the process |
 */
export class CronRunner {
  readonly #jobs = new Map<string, ScheduledJob>();
  readonly #lock = new SlotLock();

  #gate = new Semaphore(DEFAULT_MAX_CONCURRENT);
  #running = false;
  #runTokenCounter = 0;

  /** Arms a job. Called by `defineCron`, never directly. */
  register(job: Scheduled, handler: CronHandler): void {
    if (this.#jobs.has(job.name)) {
      throw new Error(
        `CronRunner.register(): "${job.name}" is already registered`,
      );
    }
    this.#jobs.set(job.name, new ScheduledJob(job, handler, new Date()));
  }

  /** The jobs armed so far. */
  jobs(): readonly Scheduled[] {
    return [...this.#jobs.values()].map((scheduled) => scheduled.job);
  }

  /**
   * Starts the loop, which is safe to do before a single job is declared.
   *
   * The loop sleeps until the next known occurrence rather than on a fixed tick, so a
   * declaration that arrives later is simply seen on the following turn.
   */
  start(
    tickMs = DEFAULT_TICK_MS,
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
  ): void {
    if (this.#running) return;

    this.#running = true;
    this.#gate = new Semaphore(maxConcurrent);

    this.#loop(tickMs).catch((error) => {
      // A crashed loop used to restart with no trace at all, which meant a process could
      // stop running its schedule and nothing anywhere said so.
      console.error(
        `[cron-runner] loop crashed, restarting in ${LOOP_RESTART_DELAY_MS}ms:`,
        error,
      );
      this.#running = false;
      setTimeout(() => this.start(tickMs, maxConcurrent), LOOP_RESTART_DELAY_MS);
    });
  }

  /** Stops the loop. A run already under way is left to finish. */
  stop(): void {
    this.#running = false;
  }

  async #loop(tickMs: number): Promise<void> {
    while (this.#running) {
      const now = new Date();

      for (const scheduled of this.#jobs.values()) {
        if (!scheduled.isDue(now)) continue;

        // The occurrence is taken whatever happens next, and that is the point: a job that
        // overruns its own period skips the occurrences it missed instead of queueing them
        // behind itself. Taking the slot inside the call that decides whether to fire hid
        // that, and read as if a skipped occurrence would come back.
        const slot = scheduled.takeSlot(now);
        if (scheduled.running) continue;

        this.#fire(scheduled, slot);
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
    const token = ++this.#runTokenCounter;
    scheduled.beginRun(token);

    this.#execute(scheduled, slot).finally(() => scheduled.endRun(token));
  }

  // The lock is claimed inside the gate, never before it. A replica that won a lock and then
  // queued behind the semaphore would hold that occurrence idle for everyone else.
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

/** The runner of this process, started once by its bootstrapper. */
export const cronRunner: CronRunner = new CronRunner();
