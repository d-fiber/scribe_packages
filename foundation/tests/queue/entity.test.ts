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

import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { Queue, queueRegistry, queueRunner } from "@scribe/foundation/src/queue/mod.ts";

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
