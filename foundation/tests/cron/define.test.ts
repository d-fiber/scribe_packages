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

// `defineCron` registers both in the registry (introspection, startup report)
// and in `cronRunner` (execution). These tests cover the declaration; the firing
// itself is covered by runner.test.ts.

import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { Time } from "@scribe/core/contracts/common/time.ts";
import { cronRegistry, defineCron, every } from "@scribe/foundation/src/cron/mod.ts";

const noop = () => Promise.resolve();

Deno.test("defineCron() arms the job and returns its next occurrence", () => {
  const job = defineCron(
    { name: "test:define:next-run", schedule: every(Time.minutes(5)) },
    noop,
  );

  assertEquals(job.name, "test:define:next-run");
  assertEquals(job.nextRun() > new Date(), true);
});

Deno.test("defineCron() applies the default 10-minute timeout", () => {
  const job = defineCron(
    { name: "test:define:default-timeout", schedule: every(Time.minutes(1)) },
    noop,
  );

  assertEquals(job.timeout.ms, Time.minutes(10).ms);
});

Deno.test("defineCron() refuses a timeout that is not a whole number of minutes", () => {
  assertThrows(() =>
    defineCron(
      {
        name: "test:define:bad-timeout",
        schedule: every(Time.minutes(1)),
        timeout: Time.seconds(90),
      },
      noop,
    )
  );
});

Deno.test("defineCron() refuses two jobs with the same name", () => {
  defineCron(
    { name: "test:define:duplicate", schedule: every(Time.minutes(1)) },
    noop,
  );

  assertThrows(() =>
    defineCron(
      { name: "test:define:duplicate", schedule: every(Time.minutes(1)) },
      noop,
    )
  );
});

Deno.test("the registry lists armed jobs and their next occurrence", () => {
  defineCron(
    { name: "test:define:reported", schedule: every(Time.minutes(2)) },
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
