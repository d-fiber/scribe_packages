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
import "@scribe/testing/runner.ts";
import { equals, expect, isNotNull, Scribe, throwsA } from "@scribe/alchemy/test";
import "../../testing/settings.ts";

import { Duration } from "@scribe/alchemy";
import { at, cronExpression, every } from "../../../lib/src/cron/schedule.ts";
import { CronTimezone } from "../../../lib/src/cron/cron_timezone.ts";
Scribe.test("Duration.minutes/hours/days convert to the right ms", () => {
  expect(Duration.minutes(1).inMilliseconds, equals(60_000));
  expect(Duration.minutes(5).inMilliseconds, equals(300_000));
  expect(Duration.hours(1).inMilliseconds, equals(3_600_000));
  expect(Duration.days(1).inMilliseconds, equals(86_400_000));
});

Scribe.test(
  "every() rejects zero, negative, fractional and sub-minute intervals the scheduler only ticks on the minute",
  () => {
    expect(() => every(Duration.minutes(0)), throwsA(isNotNull));
    expect(() => every(Duration.minutes(-1)), throwsA(isNotNull));
    expect(() => every(Duration.minutes(1.5)), throwsA(isNotNull));
    expect(() => every(Duration.hours(0)), throwsA(isNotNull));
    expect(() => every(Duration.days(-2)), throwsA(isNotNull));
    expect(() => every(Duration.seconds(30)), throwsA(isNotNull));
    expect(() => every(Duration.milliseconds(1)), throwsA(isNotNull));
  },
);

Scribe.test(
  "every() wraps a whole-minute interval as-is, no timezone attached",
  () => {
    const schedule = every(Duration.minutes(5));
    expect(schedule.kind, equals("interval"));
    expect(schedule.every.inMinutes, equals(5), "the interval is kept as the duration it was declared with");
  },
);

Scribe.test(
  "cronExpression() validates the expression eagerly (fails at declaration, not at the next tick)",
  () => {
    const fiveTokensAllOutOfRange = "99 99 99 99 99";

    expect(
      () => cronExpression(fiveTokensAllOutOfRange, CronTimezone.Utc),
      throwsA(isNotNull),
      "the CronExpression type only counts the tokens, so croner's parser is what has to " +
        "refuse the values inside them",
    );
  },
);

Scribe.test(
  "cronExpression() builds a schedule carrying the expression, timezone and underlying Cron job",
  () => {
    const schedule = cronExpression("0 3 * * *", CronTimezone.EuropeParis);

    expect(schedule.kind, equals("cron"));
    expect(schedule.expression, equals("0 3 * * *"));
    expect(schedule.timezone, equals(CronTimezone.EuropeParis));
  },
);

Scribe.test("at() rejects an empty times list", () => {
  expect(() => at(CronTimezone.Utc), throwsA(isNotNull));
});

Scribe.test(
  "at() rejects an out-of-range time (regex checks real 24h bounds, the type only checks shape)",
  () => {
    expect(() => at(CronTimezone.Utc, "25:00"), throwsA(isNotNull));
    expect(() => at(CronTimezone.Utc, "12:60"), throwsA(isNotNull));
  },
);

Scribe.test(
  "at() builds one independent Cron job per time (not one combined expression)",
  () => {
    const schedule = at(CronTimezone.Utc, "00:00", "12:00");

    expect(schedule.kind, equals("daily"));
    expect(schedule.times, equals(["00:00", "12:00"]));
    expect(schedule.timezone, equals(CronTimezone.Utc));
    expect(schedule.jobs.length, equals(2));
  },
);
