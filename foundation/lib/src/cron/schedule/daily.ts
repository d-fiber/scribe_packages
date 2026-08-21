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

import type { CronTimezone } from "@scribe/foundation/lib/src/cron/timezone.ts";
import { Cron } from "croner";

/** A 24-hour time of day, as `HH:MM`. */
export type TimeOfDay = `${number}:${number}`;

/** A job placed on the calendar at one or more times of day. */
export interface DailySchedule {
  /** What tells this schedule from an interval or a cron expression. */
  readonly kind: "daily";

  /** The times of day this job runs at, as they were declared. */
  readonly times: readonly TimeOfDay[];

  /** The zone {@link times} are read in, which is what makes them survive a change of offset. */
  readonly timezone: CronTimezone;

  /**
   * One croner job per entry of {@link times}, in the same order.
   *
   * They are built once and kept, because building one to answer a single question would
   * parse the expression again on every tick.
   */
  readonly jobs: readonly Cron[];
}

const _TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Runs the job at each of `times`, in `timezone`.
 *
 * One `Cron` per time rather than one expression listing them: croner answers the next
 * occurrence of each, and the schedule takes the earliest. Both refusals, an empty list and a
 * time that is not a 24-hour `HH:MM`, happen at declaration, because a job that never fires is
 * a job whose absence nobody notices.
 */
export function at(
  timezone: CronTimezone,
  ...times: readonly TimeOfDay[]
): DailySchedule {
  if (times.length === 0) {
    throw new Error('at(): expected at least one "HH:MM" time');
  }

  const jobs = times.map((time) => {
    if (!_TIME_OF_DAY.test(time)) {
      throw new Error(`at(): "${time}" is not a valid 24h "HH:MM" time`);
    }
    const [hours, minutes] = time.split(":");
    return new Cron(`${Number(minutes)} ${Number(hours)} * * *`, { timezone });
  });

  return { kind: "daily", times, timezone, jobs };
}
