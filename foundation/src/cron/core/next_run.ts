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

import type { Schedule } from "@scribe/foundation/src/cron/schedule/mod.ts";

/** When the schedule next fires after `after`. */
export function nextRun(schedule: Schedule, after: Date): Date {
  switch (schedule.kind) {
    case "interval":
      return new Date(after.getTime() + schedule.ms);

    case "cron": {
      const next = schedule.job.nextRun(after);
      if (!next) {
        throw new Error(`cron(): "${schedule.expression}" has no future run`);
      }
      return next;
    }

    case "daily": {
      const candidates = schedule.jobs
        .map((job) => job.nextRun(after))
        .filter((d): d is Date => d !== null);
      if (candidates.length === 0) {
        throw new Error(
          `at(): no future run for times [${schedule.times.join(", ")}]`,
        );
      }
      return candidates.reduce((earliest, d) => (d < earliest ? d : earliest));
    }
  }
}

/**
 * Where the schedule stands once an occurrence has been taken.
 *
 * Occurrences a stalled process slept through are **skipped, not replayed**: an interval
 * advances by whole intervals until it is in the future, and a calendar schedule is asked
 * from now. It is the policy Quartz calls "do nothing", and it is the only one here, because a
 * process down for three hours must not wake up owing three hours of work.
 */
export function nextRunAfterSlot(
  schedule: Schedule,
  slot: Date,
  now: Date,
): Date {
  if (schedule.kind !== "interval") return nextRun(schedule, now);

  let next = slot.getTime() + schedule.ms;
  while (next <= now.getTime()) next += schedule.ms;
  return new Date(next);
}
