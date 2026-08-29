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
import { equals, expect, isNot, isNotNull, isTrue, Scribe, throwsA } from "@scribe/alchemy/test";
import "../../testing/settings.ts";

import { Duration } from "@scribe/alchemy";
import { at, cronExpression, every } from "../../../lib/src/cron/schedule.ts";
import type { TimeOfDay } from "../../../lib/src/cron/daily_schedule.ts";
import { CronTimezone } from "../../../lib/src/cron/cron_timezone.ts";
import { nextRun, nextRunAfterSlot } from "../../../lib/src/cron/next_run.ts";

const REFUSED_TIMES: TimeOfDay[] = [
  "24:00",
  "00:60",
  "0:0",
  "1e1:00",
  "8:00",
  "08:0",
  "-1:00",
  "00:-1",
  "0x0:00",
  "12:00 ",
  " 12:00",
  "12:00\n",
];

Scribe.test("at() refuses every string that reads like a time without being one", () => {
  for (const time of REFUSED_TIMES) {
    expect(
      () => at(CronTimezone.Utc, time),
      throwsA(isNotNull),
      `at() accepted ${JSON.stringify(time)}, which croner would place somewhere nobody asked for`,
    );
  }
});

Scribe.test("at() accepts the two ends of the day and nothing past them", () => {
  expect(at(CronTimezone.Utc, "00:00", "23:59").jobs.length, equals(2));
  expect(() => at(CronTimezone.Utc, "23:60"), throwsA(isNotNull));
  expect(() => at(CronTimezone.Utc, "24:00"), throwsA(isNotNull));
});

Scribe.test("at() with a hundred times builds a hundred croner jobs and asks all of them", () => {
  const times: TimeOfDay[] = [];
  for (let minute = 0; times.length < 100; minute += 14) {
    const hour = Math.floor(minute / 60) % 24;
    times.push(
      `${String(hour).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}` as TimeOfDay,
    );
  }

  const schedule = at(CronTimezone.Utc, ...times);

  expect(schedule.jobs.length, equals(100));
  expect(nextRun(schedule, new Date("2026-01-01T00:00:30.000Z")) > new Date("2026-01-01T00:00:30.000Z"), equals(true));
});

Scribe.test("at() keeps a time declared twice as two jobs, so the same occurrence is computed twice", () => {
  expect(at(CronTimezone.Utc, "03:00", "03:00").jobs.length, equals(2));
});

Scribe.test("every() refuses a duration that is not a whole number of minutes, in milliseconds", () => {
  expect(() => every(Duration.milliseconds(60_000.5)), throwsA(isNotNull));
  expect(() => every(Duration.milliseconds(59_999)), throwsA(isNotNull));
  expect(() => every(Duration.milliseconds(NaN)), throwsA(isNotNull));
  expect(() => every(Duration.milliseconds(Infinity)), throwsA(isNotNull));
  expect(() => every(Duration.milliseconds(-0)), throwsA(isNotNull));
  expect(every(Duration.milliseconds(60_000)).every.inMinutes, equals(1));
});

Scribe.test("every() accepts a ten-year interval, and nextRun() puts it on the grid within one", () => {
  const period = 3650 * 86_400_000;
  const decade = every(Duration.days(3650));
  const after = new Date("2026-01-01T00:00:00.000Z");
  const next = nextRun(decade, after).getTime();

  expect(next % period, equals(0), "an interval fires on the grid of the epoch, whatever its size");
  expect(next > after.getTime() && next - after.getTime() <= period, isTrue);
});

Scribe.test("cronExpression() refuses an expression croner cannot parse", () => {
  expect(() => cronExpression("99 99 99 99 99", CronTimezone.Utc), throwsA(isNotNull));
  expect(() => cronExpression("0 0 * *  ", CronTimezone.Utc), throwsA(isNotNull));
  expect(() => cronExpression("0 0 * * * * *", CronTimezone.Utc), throwsA(isNotNull));
});

Scribe.test("cronExpression() takes five valid fields that name no date and only fails when something asks", () => {
  expect(
    () => cronExpression("0 0 30 2 *", CronTimezone.Utc),
    throwsA(isNotNull),
    "the 30th of February parses, so the refusal lands on the first nextRun() instead of on " +
      "the line that declared it",
  );
});

Scribe.test("cronExpression() takes six fields, which is a schedule finer than the loop can serve", () => {
  expect(
    () => cronExpression("*/5 * * * * *", CronTimezone.Utc),
    throwsA(isNotNull),
    "the type says five fields and croner reads six, so a five-second schedule is declarable " +
      "while the loop floors nothing below a minute",
  );
});

Scribe.test("cronExpression() refuses a zone croner does not know, where the schedule is declared", () => {
  expect(() => cronExpression("0 3 * * *", "Mars/Phobos" as CronTimezone), throwsA(isNotNull));
});

Scribe.test("nextRunAfterSlot() lands on the same instant whether it steps or counts", () => {
  const step = 60_000;
  const slot = new Date("2026-01-01T00:00:00.000Z");
  const schedule = every(Duration.milliseconds(step));

  for (const elapsed of [-5_000, 0, 1, 59_999, 60_000, 60_001, 599_999, 86_400_000]) {
    const now = new Date(slot.getTime() + elapsed);
    const counted = slot.getTime() +
      (elapsed < 0 ? 1 : Math.floor(elapsed / step) + 1) * step;

    expect(nextRunAfterSlot(schedule, slot, now).getTime(), equals(counted), `elapsed ${elapsed} ms`);
  }
});

Scribe.test("nextRunAfterSlot() keeps the next occurrence ahead of a clock that went backwards", () => {
  const schedule = every(Duration.minutes(5));
  const slot = new Date("2026-01-01T12:00:00.000Z");
  const rewound = new Date("2026-01-01T11:00:00.000Z");

  expect(
    nextRunAfterSlot(schedule, slot, rewound).toISOString(),
    equals("2026-01-01T12:05:00.000Z"),
    "an hour lost off the clock did not move an interval occurrence back into the past",
  );
});

Scribe.test("nextRun() on a calendar schedule follows a clock that went backwards", () => {
  const schedule = at(CronTimezone.Utc, "12:00");
  const slot = new Date("2026-01-01T12:00:00.000Z");
  const rewound = new Date("2026-01-01T11:00:00.000Z");

  expect(
    nextRunAfterSlot(schedule, slot, rewound).toISOString(),
    equals("2026-01-01T12:00:00.000Z"),
    "the occurrence just taken is handed out again, and only the cross-replica marker keeps " +
      "it from being run twice",
  );
});

Scribe.test("a spring-forward day moves an hour that does not exist to the one that replaced it", () => {
  const schedule = at(CronTimezone.EuropeParis, "02:30");

  expect(
    nextRun(schedule, new Date("2026-03-28T12:00:00.000Z")).toISOString(),
    equals("2026-03-29T01:30:00.000Z"),
    "02:30 Paris does not exist on 2026-03-29, and the occurrence lands at 03:30 local",
  );
});

Scribe.test("an autumn day that holds an hour twice fires the schedule once", () => {
  const schedule = at(CronTimezone.EuropeParis, "02:30");
  const before = nextRun(schedule, new Date("2026-10-24T12:00:00.000Z"));

  expect(before.toISOString(), equals("2026-10-25T01:30:00.000Z"));
  expect(
    nextRun(schedule, new Date(before.getTime() + 1)).toISOString(),
    equals("2026-10-26T01:30:00.000Z"),
    "the earlier of the two 02:30 Paris instants is not offered a second time",
  );
});

Scribe.test("a daily lease covers the day the offset changed, short or long", () => {
  const schedule = at(CronTimezone.EuropeParis, "02:30");
  const springSlot = new Date("2026-03-29T01:30:00.000Z");
  const autumnSlot = new Date("2026-10-25T01:30:00.000Z");

  expect(nextRunAfterSlot(schedule, springSlot, springSlot).getTime() - springSlot.getTime(), equals(23 * 3_600_000));
  expect(nextRunAfterSlot(schedule, autumnSlot, autumnSlot).getTime() - autumnSlot.getTime(), equals(24 * 3_600_000));
  expect(nextRunAfterSlot(schedule, springSlot, springSlot).getTime() - springSlot.getTime(), isNot(equals(0)));
});
