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
import "@scribe/runtime/scholium/runner.ts";
import { equals, expect, Scribe } from "@scribe/alchemy/test";
import "../../testing/settings.ts";

import { nextRun, nextRunAfterSlot } from "../../../lib/src/cron/next_run.ts";
import { at, cronExpression, every } from "../../../lib/src/cron/schedule.ts";
import { Duration } from "@scribe/alchemy";
import { CronTimezone } from "../../../lib/src/cron/cron_timezone.ts";
Scribe.test(
  "nextRun() for an interval schedule adds the interval to `after`, no wall-clock involved",
  () => {
    const schedule = every(Duration.minutes(5));
    const after = new Date("2026-01-01T00:00:00.000Z");

    const next = nextRun(schedule, after);

    expect(next.getTime(), equals(after.getTime() + 5 * 60_000));
  },
);

Scribe.test(
  "nextRun() for a daily schedule picks the earliest upcoming time among several",
  () => {
    const schedule = at(CronTimezone.Utc, "00:00", "12:00");
    const after = new Date("2026-01-01T06:00:00.000Z");

    const next = nextRun(schedule, after);

    expect(next.toISOString(), equals("2026-01-01T12:00:00.000Z"));
  },
);

Scribe.test(
  "nextRun() for a daily schedule wraps to tomorrow once today has passed",
  () => {
    const schedule = at(CronTimezone.Utc, "00:00", "12:00");
    const after = new Date("2026-01-01T18:00:00.000Z");

    const next = nextRun(schedule, after);

    expect(next.toISOString(), equals("2026-01-02T00:00:00.000Z"));
  },
);

Scribe.test(
  "nextRun() for a cron schedule delegates to croner and respects the given timezone",
  () => {
    const schedule = cronExpression("0 3 * * *", CronTimezone.Utc);
    const after = new Date("2026-01-01T00:00:00.000Z");

    const next = nextRun(schedule, after);

    expect(next.toISOString(), equals("2026-01-01T03:00:00.000Z"));
  },
);

Scribe.test(
  "nextRun() for a cron schedule rolls over to the next day once today's occurrence has passed",
  () => {
    const schedule = cronExpression("0 3 * * *", CronTimezone.Utc);
    const after = new Date("2026-01-01T04:00:00.000Z");

    const next = nextRun(schedule, after);

    expect(next.toISOString(), equals("2026-01-02T03:00:00.000Z"));
  },
);

Scribe.test(
  "nextRunAfterSlot() anchors an interval on the grid, not on the firing instant",
  () => {
    const schedule = every(Duration.minutes(1));
    const slot = new Date("2026-01-01T00:00:00.000Z");
    const firedFifteenSecondsLate = new Date("2026-01-01T00:00:15.000Z");

    expect(
      nextRunAfterSlot(schedule, slot, firedFifteenSecondsLate).toISOString(),
      equals("2026-01-01T00:01:00.000Z"),
      "the next run landed on the grid, so the 15s of lag does not carry over to every round",
    );
  },
);

Scribe.test(
  "nextRunAfterSlot() jumps to the next future slot after a long outage",
  () => {
    const schedule = every(Duration.minutes(1));
    const slot = new Date("2026-01-01T00:00:00.000Z");
    const nineSlotsLater = new Date("2026-01-01T00:09:30.000Z");

    expect(
      nextRunAfterSlot(schedule, slot, nineSlotsLater).toISOString(),
      equals("2026-01-01T00:10:00.000Z"),
      "the nine missed slots were dropped rather than fired back to back",
    );
  },
);

Scribe.test(
  "nextRunAfterSlot() leaves wall-clock schedules to croner",
  () => {
    const schedule = cronExpression("0 3 * * *", CronTimezone.EuropeParis);
    const slot = new Date("2026-01-01T02:00:00.000Z");
    const now = new Date("2026-01-01T02:05:00.000Z");

    expect(
      nextRunAfterSlot(schedule, slot, now).getTime(),
      equals(nextRun(schedule, now).getTime()),
      "croner recomputed the occurrence from now, and the slot it drifted from played no part",
    );
  },
);
