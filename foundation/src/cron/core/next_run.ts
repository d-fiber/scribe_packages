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
