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

import {
  DateTime,
  DuplicateDeclarationError,
  Duration,
  Future,
  Semaphore,
  type UnmodifiableList,
  withDeadline,
} from "@scribe/alchemy";
import { log } from "@scribe/alchemy/observe";
import type { CronHandler, Scheduled } from "@scribe/foundation/lib/src/cron/schedule.ts";
import { ScheduledJob } from "./scheduled_job.ts";
import { SlotLock } from "./slot_lock.ts";

/** The longest the loop sleeps, however far away the next occurrence is. */
const DEFAULT_TICK: Duration = Duration.seconds(30);

/** How long a crashed loop stays down before it comes back. */
const RESTART_AFTER: Duration = Duration.seconds(5);

/** The shortest the loop sleeps, so a schedule that is always due cannot spin it. */
const SLEEP_AT_LEAST: Duration = Duration.milliseconds(50);
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
      throw new DuplicateDeclarationError(
        `CronRunner.register(): "${job.name}" is already registered`,
      );
    }
    this.#jobs.set(job.name, new ScheduledJob(job, handler, _now()));
  }

  /** The jobs armed so far. */
  jobs(): UnmodifiableList<Scheduled> {
    return [...this.#jobs.values()].map((scheduled) => scheduled.job);
  }

  /**
   * Starts the loop, which is safe to do before a single job is declared.
   *
   * The loop sleeps until the next known occurrence rather than on a fixed tick, so a
   * declaration that arrives later is simply seen on the following turn. A loop that crashes
   * says so and restarts after {@link RESTART_AFTER}, because a process that quietly
   * stopped running its schedule is one nobody notices.
   */
  start(tick: Duration = DEFAULT_TICK, maxConcurrent = DEFAULT_MAX_CONCURRENT): void {
    if (this.#running) return;

    this.#running = true;
    this.#gate = new Semaphore(maxConcurrent);

    this.#loop(tick).catch((error) => {
      log.error("cron-runner.loop_crashed", {
        metadata: { restartingIn: RESTART_AFTER.toString(), error },
      });
      this.#running = false;
      Future.delayed(RESTART_AFTER).then(() => this.start(tick, maxConcurrent));
    });
  }

  /** Stops the loop. A run already under way is left to finish. */
  stop(): void {
    this.#running = false;
  }

  /**
   * Walks the schedule on every tick and fires what is due.
   *
   * The occurrence is taken whatever happens next, and that is the point: a job that overruns
   * its own period skips the occurrences it missed instead of queueing them behind itself.
   */
  async #loop(tick: Duration): Future<void> {
    while (this.#running) {
      const now = _now();

      for (const scheduled of this.#jobs.values()) {
        if (!scheduled.isDue(now)) continue;

        const slot = scheduled.takeSlot(now);
        if (scheduled.running) continue;

        this.#fire(scheduled, slot);
      }

      await Future.delayed(this.#sleepFor(tick));
    }
  }

  /** How long to sleep before the next tick, never longer than `atMost`. */
  #sleepFor(atMost: Duration): Duration {
    let earliest = Number.POSITIVE_INFINITY;
    for (const scheduled of this.#jobs.values()) {
      earliest = Math.min(earliest, scheduled.nextRunAt.getTime());
    }

    if (!Number.isFinite(earliest)) return atMost;

    const untilDue = earliest - DateTime.now().millisecondsSinceEpoch;
    return Duration.milliseconds(
      Math.min(atMost.inMilliseconds, Math.max(SLEEP_AT_LEAST.inMilliseconds, untilDue)),
    );
  }

  /** Marks `scheduled` as running for this occurrence, and starts it. */
  #fire(scheduled: ScheduledJob, slot: Date): void {
    const token = ++this.#runTokenCounter;
    scheduled.beginRun(token);

    this.#execute(scheduled, slot).finally(() => scheduled.endRun(token));
  }

  /**
   * Runs one occurrence of `scheduled`, once the gate and the cross-replica lock allow it.
   *
   * The lock is claimed inside the gate and never before it. A replica that won a lock and
   * then queued behind the semaphore would hold that occurrence idle for everyone else.
   */
  #execute(scheduled: ScheduledJob, slot: Date): Future<void> {
    return this.#gate.run(async () => {
      try {
        if (!(await this.#lock.claim(scheduled.job, slot))) return;

        await withDeadline(
          `cron:${scheduled.name}`,
          scheduled.job.timeout,
          Promise.resolve(scheduled.handler()),
        );
      } catch (error) {
        log.error("cron-runner.job_failed", { metadata: { job: scheduled.name, error } });
      }
    });
  }
}

/** The runner of this process, started once by its bootstrapper. */
export const cronRunner: CronRunner = new CronRunner();

/** What time it is, as the schedules want it: the clock is the slot's, the shape is croner's. */
function _now(): Date {
  return new Date(DateTime.now().millisecondsSinceEpoch);
}
