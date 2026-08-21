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

import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { Queue, queueRegistry, queueRunner } from "@scribe/foundation/lib/src/queue/mod.ts";

Deno.test("new Queue() arms the body with the runner", () => {
  new Queue<{ id: string }>(
    { name: "test:define:immediate" },
    () => Promise.resolve(),
  );

  assertEquals(queueRunner.names().includes("test:define:immediate"), true);
});

Deno.test("new Queue() distinguishes batch mode from job-by-job mode", () => {
  new Queue<{ id: string }>(
    { name: "test:define:batch", batch: { lingerMs: 100 } },
    () => Promise.resolve(),
  );

  const entry = queueRegistry.get("test:define:batch");
  assertEquals(entry?.mode, "batch");
  assertEquals(queueRegistry.get("test:define:immediate")?.mode, "immediate");
});

Deno.test("new Queue() returns the producer side", () => {
  const queue = new Queue<{ id: string }>(
    { name: "test:define:producer" },
    () => Promise.resolve(),
  );

  assertEquals(queue.name, "test:define:producer");
  assertEquals(typeof queue.push, "function");
  assertEquals(typeof queue.pushMany, "function");
});

Deno.test("new Queue() refuses two queues with the same name", () => {
  new Queue<{ id: string }>(
    { name: "test:define:duplicate" },
    () => Promise.resolve(),
  );

  assertThrows(() =>
    new Queue<{ id: string }>(
      { name: "test:define:duplicate" },
      () => Promise.resolve(),
    )
  );
});

Deno.test("the registry returns a compact report, without listing names", () => {
  const report = queueRegistry.report();

  assertStringIncludes(report, "[queue]");
  assertStringIncludes(report, "declared");
  assertEquals(
    report.includes("test:define:immediate"),
    false,
    "the report counts the queues instead of naming them, which a project with thousands "
      + "of them could not read",
  );
});

Deno.test("a queue's linger delay is indeed carried by the registry", () => {
  new Queue<{ id: string }>(
    { name: "test:define:linger", batch: { lingerMs: 2_500 } },
    () => Promise.resolve(),
  );

  assertEquals(
    queueRegistry.get("test:define:linger")?.lingerMs,
    2_500,
    "the declared linger reached the registry, where graceFor() reads it to widen the fetch",
  );
  assertEquals(
    queueRegistry.get("test:define:immediate")?.lingerMs,
    undefined,
    "a queue declared without batch mode carries no linger at all",
  );
});
