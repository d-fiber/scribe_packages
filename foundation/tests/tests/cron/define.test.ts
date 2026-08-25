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

import { installDrivers } from "../../testing/drivers.ts";
import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { Duration } from "@scribe/alchemy";
import { Cron } from "../../../lib/src/cron/cron.ts";
import { cronRegistry } from "../../../lib/src/cron/cron_registry.ts";
import { every } from "../../../lib/src/cron/interval_schedule.ts";

const noop = () => Promise.resolve();

installDrivers();

Deno.test("new Cron() arms the job and returns its next occurrence", () => {
  const job = new Cron(
    { name: "test:define:next-run", schedule: every(Duration.minutes(5)) },
    noop,
  );

  assertEquals(job.name, "test:define:next-run");
  assertEquals(job.nextRun() > new Date(), true);
});

Deno.test("new Cron() applies the default 10-minute timeout", () => {
  const job = new Cron(
    { name: "test:define:default-timeout", schedule: every(Duration.minutes(1)) },
    noop,
  );

  assertEquals(job.timeout.inMilliseconds, Duration.minutes(10).inMilliseconds);
});

Deno.test("new Cron() refuses a timeout that is not a whole number of minutes", () => {
  assertThrows(() =>
    new Cron(
      {
        name: "test:define:bad-timeout",
        schedule: every(Duration.minutes(1)),
        timeout: Duration.seconds(90),
      },
      noop,
    )
  );
});

Deno.test("new Cron() refuses two jobs with the same name", () => {
  new Cron(
    { name: "test:define:duplicate", schedule: every(Duration.minutes(1)) },
    noop,
  );

  assertThrows(() =>
    new Cron(
      { name: "test:define:duplicate", schedule: every(Duration.minutes(1)) },
      noop,
    )
  );
});

Deno.test("the registry lists armed jobs and their next occurrence", () => {
  new Cron(
    { name: "test:define:reported", schedule: every(Duration.minutes(2)) },
    noop,
  );

  const report = cronRegistry.report();

  assertStringIncludes(report, "[cron]");
  assertStringIncludes(report, "test:define:reported");
  assertEquals(
    cronRegistry.list().some((e) => e.job.name === "test:define:reported"),
    true,
  );
});
