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
import { equals, expect, isNotNull, Scribe, throwsA } from "@scribe/alchemy/test";
import "../../testing/settings.ts";

import { CronRegistry } from "../../../lib/src/cron/cron_registry.ts";
import type { Scheduled } from "../../../lib/src/cron/schedule.ts";
import { Duration } from "@scribe/alchemy";

function intervalJob(name: string, every: Duration): Scheduled {
  return { name, schedule: { kind: "interval", every }, timeout: Duration.seconds(30) };
}

function entry(name: string, every: Duration, at: Date) {
  return { job: intervalJob(name, every), nextRun: () => at };
}

Scribe.test("a fresh registry reports that nothing is declared", () => {
  const registry = new CronRegistry();

  expect(registry.report(), equals("[cron] no job declared"));
  expect(registry.list().length, equals(0));
});

Scribe.test("add() refuses a name already registered", () => {
  const registry = new CronRegistry();
  registry.add(entry("digest", Duration.minutes(5), new Date(1_000)));

  expect(() => registry.add(entry("digest", Duration.minutes(1), new Date(2_000))), throwsA(isNotNull));
});

Scribe.test("list() answers every declaration in the order it was added", () => {
  const registry = new CronRegistry();
  registry.add(entry("first", Duration.minutes(5), new Date(1_000)));
  registry.add(entry("second", Duration.minutes(1), new Date(2_000)));

  expect(registry.list().map((e) => e.job.name), equals(["first", "second"]));
});

Scribe.test("report() orders jobs by next occurrence, not by declaration order", () => {
  const registry = new CronRegistry();
  registry.add(entry("later", Duration.minutes(5), new Date(2_000)));
  registry.add(entry("sooner", Duration.minutes(1), new Date(1_000)));

  const report = registry.report();

  expect(report.indexOf("sooner") < report.indexOf("later"), equals(true));
});

Scribe.test("report() reads nextRun fresh rather than a value cached at add()", () => {
  const registry = new CronRegistry();
  let at = new Date(1_000);
  registry.add({ job: intervalJob("moving", Duration.minutes(5)), nextRun: () => at });

  expect(registry.report(), equals(registry.report()));
  at = new Date(9_000);
  expect(registry.report(), equals(`[cron] 1 job(s) armed · next: moving ${at.toISOString()}`));
});
