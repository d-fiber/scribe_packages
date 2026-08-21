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

import type { Scheduled } from "@scribe/foundation/lib/src/cron/schedule/mod.ts";

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
