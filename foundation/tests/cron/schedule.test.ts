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

import { Duration } from "@scribe/alchemy";
import { at, cronExpression, every } from "@scribe/foundation/lib/src/cron/schedule/mod.ts";
import { CronTimezone } from "@scribe/foundation/lib/src/cron/timezone.ts";
import { assertEquals, assertThrows } from "@std/assert";

Deno.test("Duration.minutes/hours/days convert to the right ms", () => {
  assertEquals(Duration.minutes(1).inMilliseconds, 60_000);
  assertEquals(Duration.minutes(5).inMilliseconds, 300_000);
  assertEquals(Duration.hours(1).inMilliseconds, 3_600_000);
  assertEquals(Duration.days(1).inMilliseconds, 86_400_000);
});

Deno.test(
  "every() rejects zero, negative, fractional and sub-minute intervals the scheduler only ticks on the minute",
  () => {
    assertThrows(() => every(Duration.minutes(0)));
    assertThrows(() => every(Duration.minutes(-1)));
    assertThrows(() => every(Duration.minutes(1.5)));
    assertThrows(() => every(Duration.hours(0)));
    assertThrows(() => every(Duration.days(-2)));
    assertThrows(() => every(Duration.seconds(30)));
    assertThrows(() => every(Duration.milliseconds(1)));
  },
);

Deno.test(
  "every() wraps a whole-minute interval as-is, no timezone attached",
  () => {
    const schedule = every(Duration.minutes(5));
    assertEquals(schedule, { kind: "interval", ms: 300_000 });
  },
);

Deno.test(
  "cronExpression() validates the expression eagerly (fails at declaration, not at the next tick)",
  () => {
    const fiveTokensAllOutOfRange = "99 99 99 99 99";

    assertThrows(
      () => cronExpression(fiveTokensAllOutOfRange, CronTimezone.Utc),
      "the CronExpression type only counts the tokens, so croner's parser is what has to "
        + "refuse the values inside them",
    );
  },
);

Deno.test(
  "cronExpression() builds a schedule carrying the expression, timezone and underlying Cron job",
  () => {
    const schedule = cronExpression("0 3 * * *", CronTimezone.EuropeParis);

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
