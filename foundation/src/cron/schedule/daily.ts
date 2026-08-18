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

import type { CronTimezone } from "@scribe/foundation/src/cron/timezone.ts";
import { Cron } from "croner";

/** A 24-hour time of day, as `HH:MM`. */
export type TimeOfDay = `${number}:${number}`;

/** A job placed on the calendar at one or more times of day. */
export interface DailySchedule {
  readonly kind: "daily";
  readonly times: readonly TimeOfDay[];
  readonly timezone: CronTimezone;
  readonly jobs: readonly Cron[];
}

const _TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Runs the job at each of `times`, in `timezone`.
 *
 * One `Cron` per time rather than one expression listing them: croner answers the next
 * occurrence of each, and the schedule takes the earliest. Both refusals — an empty list, a
 * time that is not a 24-hour `HH:MM` — happen at declaration, because a job that never fires
 * is a job whose absence nobody notices.
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
