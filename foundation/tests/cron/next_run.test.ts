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

// File name doesn't start with `_` (unlike the source _next_run.ts): the
// private-module-scope lint only cares about the source tree, and test file
// names under tests/tests/ mirror it for discoverability, not for privacy.

import { nextRun, nextRunAfterSlot } from "@scribe/foundation/src/cron/core/next_run.ts";
import { at, cronExpression, every } from "@scribe/foundation/src/cron/schedule/mod.ts";
import { Time } from "@scribe/core/contracts/common/time.ts";
import { CronTimezone } from "@scribe/foundation/src/cron/timezone.ts";
import { assertEquals } from "@std/assert";

Deno.test(
  "nextRun() for an interval schedule adds the interval to `after`, no wall-clock involved",
  () => {
    const schedule = every(Time.minutes(5));
    const after = new Date("2026-01-01T00:00:00.000Z");

    const next = nextRun(schedule, after);

    assertEquals(next.getTime(), after.getTime() + 5 * 60_000);
  },
);

Deno.test(
  "nextRun() for a daily schedule picks the earliest upcoming time among several",
  () => {
    const schedule = at(CronTimezone.Utc, "00:00", "12:00");
    const after = new Date("2026-01-01T06:00:00.000Z"); // past 00:00, before 12:00

    const next = nextRun(schedule, after);

    assertEquals(next.toISOString(), "2026-01-01T12:00:00.000Z");
  },
);

Deno.test(
  "nextRun() for a daily schedule wraps to tomorrow once today has passed",
  () => {
    const schedule = at(CronTimezone.Utc, "00:00", "12:00");
    const after = new Date("2026-01-01T18:00:00.000Z"); // past both today

    const next = nextRun(schedule, after);

    assertEquals(next.toISOString(), "2026-01-02T00:00:00.000Z");
  },
);

Deno.test(
  "nextRun() for a cron schedule delegates to croner and respects the given timezone",
  () => {
    const schedule = cronExpression("0 3 * * *", CronTimezone.Utc);
    const after = new Date("2026-01-01T00:00:00.000Z");

    const next = nextRun(schedule, after);

    assertEquals(next.toISOString(), "2026-01-01T03:00:00.000Z");
  },
);

Deno.test(
  "nextRun() for a cron schedule rolls over to the next day once today's occurrence has passed",
  () => {
    const schedule = cronExpression("0 3 * * *", CronTimezone.Utc);
    const after = new Date("2026-01-01T04:00:00.000Z"); // already past 03:00 today

    const next = nextRun(schedule, after);

    assertEquals(next.toISOString(), "2026-01-02T03:00:00.000Z");
  },
);

Deno.test(
  "nextRunAfterSlot() anchors an interval on the grid, not on the firing instant",
  () => {
    const schedule = every(Time.minutes(1));
    const slot = new Date("2026-01-01T00:00:00.000Z");
    // Fired 15s late relative to its slot.
    const now = new Date("2026-01-01T00:00:15.000Z");

    // Anchored on `now` we would get 00:01:15 and the lag would carry over on
    // every round; anchored on the grid, we stay on 00:01:00.
    assertEquals(
      nextRunAfterSlot(schedule, slot, now).toISOString(),
      "2026-01-01T00:01:00.000Z",
    );
  },
);

Deno.test(
  "nextRunAfterSlot() jumps to the next future slot after a long outage",
  () => {
    const schedule = every(Time.minutes(1));
    const slot = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-01T00:09:30.000Z");

    // No burst catch-up of the 9 missed slots: we resume at the next one.
    assertEquals(
      nextRunAfterSlot(schedule, slot, now).toISOString(),
      "2026-01-01T00:10:00.000Z",
    );
  },
);

Deno.test(
  "nextRunAfterSlot() leaves wall-clock schedules to croner",
  () => {
    const schedule = cronExpression("0 3 * * *", CronTimezone.EuropeParis);
    const slot = new Date("2026-01-01T02:00:00.000Z");
    const now = new Date("2026-01-01T02:05:00.000Z");

    // A wall-clock time accumulates nothing: croner recomputes the next
    // occurrence from `now`, the original slot plays no part.
    assertEquals(
      nextRunAfterSlot(schedule, slot, now).getTime(),
      nextRun(schedule, now).getTime(),
    );
  },
);
