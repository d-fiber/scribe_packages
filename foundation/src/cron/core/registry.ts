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

import type { Scheduled } from "@scribe/foundation/src/cron/schedule/mod.ts";

/** A declared job, and where its next occurrence falls. */
export interface RegisteredCron {
  /** The declaration as it was given, name, schedule and timeout. */
  readonly job: Scheduled;

  /**
   * When this job is next due.
   *
   * Read rather than stored, so the startup report and the status endpoint see the same
   * answer as the loop that will fire it.
   */
  nextRun(): Date;
}

/**
 * Every declared job of this process, indexed by name.
 *
 * The name has to be unique because it is what identifies an occurrence across replicas: two
 * jobs sharing one would claim the same lock and only one of them would ever run.
 */
export class CronRegistry {
  readonly #jobs = new Map<string, RegisteredCron>();

  /** Arms a job, and refuses a name already taken. */
  add(entry: RegisteredCron): void {
    const name = entry.job.name;
    if (this.#jobs.has(name)) {
      throw new Error(
        `new Cron("${name}"): this name is already declared. A cron name ` +
          `identifies a Redis-locked occurrence, it must be unique.`,
      );
    }
    this.#jobs.set(name, entry);
  }

  /** The jobs armed so far, in declaration order. */
  list(): readonly RegisteredCron[] {
    return [...this.#jobs.values()];
  }

  /** One line naming what is armed and when each job runs next, printed at start-up. */
  report(): string {
    const jobs = this.list();
    if (jobs.length === 0) {
      return "[cron] no job declared";
    }

    const next = jobs
      .map((entry) => ({ name: entry.job.name, at: entry.nextRun() }))
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map(({ name, at }) => `${name} ${at.toISOString()}`)
      .join(", ");

    return `[cron] ${jobs.length} job(s) armed · next: ${next}`;
  }
}

/** The registry every declaration writes into. */
export const cronRegistry: CronRegistry = new CronRegistry();
