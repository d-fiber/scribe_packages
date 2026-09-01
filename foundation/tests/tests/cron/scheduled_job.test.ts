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
import { equals, expect, isFalse, isTrue, same, Scribe } from "@scribe/alchemy/test";
import "../../testing/settings.ts";

import { ScheduledJob } from "../../../lib/src/cron/scheduled_job.ts";
import type { Scheduled } from "../../../lib/src/cron/schedule.ts";
import { Duration } from "@scribe/alchemy";

function intervalJob(name: string, every: Duration): Scheduled {
  return { name, schedule: { kind: "interval", every }, timeout: Duration.seconds(30) };
}

const noop = () => Promise.resolve();

Scribe.test("name reads through to the job it was armed with", () => {
  const scheduled = new ScheduledJob(intervalJob("digest", Duration.minutes(5)), noop, () => new Date(0));

  expect(scheduled.name, equals("digest"));
});

Scribe.test("nextRunAt is computed once and cached across repeated reads", () => {
  const scheduled = new ScheduledJob(intervalJob("digest", Duration.minutes(5)), noop, () => new Date(0));

  const first = scheduled.nextRunAt;
  const second = scheduled.nextRunAt;

  expect(first, same(second));
});

Scribe.test("isDue is false before the next occurrence and true once the clock reaches it", () => {
  const scheduled = new ScheduledJob(intervalJob("digest", Duration.minutes(5)), noop, () => new Date(0));
  const at = scheduled.nextRunAt;

  expect(scheduled.isDue(new Date(at.getTime() - 1)), isFalse);
  expect(scheduled.isDue(at), isTrue);
});

Scribe.test("takeSlot returns the occurrence taken and advances nextRunAt past it", () => {
  const scheduled = new ScheduledJob(intervalJob("digest", Duration.minutes(5)), noop, () => new Date(0));
  const due = scheduled.nextRunAt;

  const taken = scheduled.takeSlot(due);

  expect(taken, equals(due));
  expect(scheduled.nextRunAt.getTime() > due.getTime(), isTrue);
});

Scribe.test("running is false until beginRun, and true while a token is held", () => {
  const scheduled = new ScheduledJob(intervalJob("digest", Duration.minutes(5)), noop, () => new Date(0));

  expect(scheduled.running, isFalse);
  scheduled.beginRun(1);
  expect(scheduled.running, isTrue);
});

Scribe.test("endRun with the matching token frees the job", () => {
  const scheduled = new ScheduledJob(intervalJob("digest", Duration.minutes(5)), noop, () => new Date(0));

  scheduled.beginRun(1);
  scheduled.endRun(1);

  expect(scheduled.running, isFalse);
});

Scribe.test("endRun with a stale token leaves a newer run holding the job", () => {
  const scheduled = new ScheduledJob(intervalJob("digest", Duration.minutes(5)), noop, () => new Date(0));

  scheduled.beginRun(1);
  scheduled.beginRun(2);
  scheduled.endRun(1);

  expect(scheduled.running, isTrue);
});
