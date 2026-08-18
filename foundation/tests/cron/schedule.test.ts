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

import { Time } from "@scribe/core/contracts/common/time.ts";
import { at, cron, every } from "@scribe/foundation/src/cron/schedule.ts";
import { CronTimezone } from "@scribe/foundation/src/cron/timezone.ts";
import { assertEquals, assertThrows } from "@std/assert";

Deno.test("Time.minutes/hours/days convert to the right ms", () => {
  assertEquals(Time.minutes(1).ms, 60_000);
  assertEquals(Time.minutes(5).ms, 300_000);
  assertEquals(Time.hours(1).ms, 3_600_000);
  assertEquals(Time.days(1).ms, 86_400_000);
});

Deno.test(
  "every() rejects zero, negative, fractional and sub-minute intervals the scheduler only ticks on the minute",
  () => {
    assertThrows(() => every(Time.minutes(0)));
    assertThrows(() => every(Time.minutes(-1)));
    assertThrows(() => every(Time.minutes(1.5)));
    assertThrows(() => every(Time.hours(0)));
    assertThrows(() => every(Time.days(-2)));
    assertThrows(() => every(Time.seconds(30)));
    assertThrows(() => every(Time.ms(1)));
  },
);

Deno.test(
  "every() wraps a whole-minute interval as-is, no timezone attached",
  () => {
    const schedule = every(Time.minutes(5));
    assertEquals(schedule, { kind: "interval", ms: 300_000 });
  },
);

Deno.test(
  "cron() validates the expression eagerly (fails at declaration, not at the next tick)",
  () => {
    // 5 space-separated tokens (matches the CronExpression shape at the
    // type level) but out-of-range field values croner's own parser must
    // reject this at runtime, the type can't.
    assertThrows(() => cron("99 99 99 99 99", CronTimezone.Utc));
  },
);

Deno.test(
  "cron() builds a schedule carrying the expression, timezone and underlying Cron job",
  () => {
    const schedule = cron("0 3 * * *", CronTimezone.EuropeParis);

    assertEquals(schedule.kind, "cron");
    assertEquals(schedule.expression, "0 3 * * *");
    assertEquals(schedule.timezone, CronTimezone.EuropeParis);
  },
);

Deno.test("at() rejects an empty times list", () => {
  assertThrows(() => at(CronTimezone.Utc));
});

Deno.test(
  "at() rejects an out-of-range time (regex checks real 24h bounds, the type only checks shape)",
  () => {
    assertThrows(() => at(CronTimezone.Utc, "25:00"));
    assertThrows(() => at(CronTimezone.Utc, "12:60"));
  },
);

Deno.test(
  "at() builds one independent Cron job per time (not one combined expression)",
  () => {
    const schedule = at(CronTimezone.Utc, "00:00", "12:00");

    assertEquals(schedule.kind, "daily");
    assertEquals(schedule.times, ["00:00", "12:00"]);
    assertEquals(schedule.timezone, CronTimezone.Utc);
    assertEquals(schedule.jobs.length, 2);
  },
);
