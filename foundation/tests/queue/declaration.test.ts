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

import {
  limitsFrom,
  QUEUE_DEFAULTS,
  type RegisteredQueue,
  subjectsOf,
} from "@scribe/foundation/src/queue/core/declaration.ts";
import { planFor, planSignature } from "@scribe/foundation/src/queue/core/topology/plan.ts";
import { Queue } from "@scribe/foundation/src/queue/mod.ts";
import { graceFor, IMMEDIATE_GRACE_MS } from "@scribe/foundation/src/queue/runner/grace.ts";
import { Time } from "@scribe/core/contracts/common/time.ts";
import { assertEquals, assertNotEquals } from "@std/assert";

function queue(over: Partial<RegisteredQueue> = {}): RegisteredQueue {
  return {
    name: "q",
    ...subjectsOf("q", over.dedicated === true),
    mode: "immediate",
    dedicated: false,
    handler: () => Promise.resolve(),
    ...limitsFrom(),
    ...over,
  };
}

Deno.test("limitsFrom falls back to the declared defaults", () => {
  assertEquals(limitsFrom(), {
    maxRetries: QUEUE_DEFAULTS.maxRetries,
    maxLen: QUEUE_DEFAULTS.maxLen,
    concurrency: QUEUE_DEFAULTS.concurrency,
    retryBackoffMs: QUEUE_DEFAULTS.retryBackoff.ms,
    retryBackoffMaxMs: QUEUE_DEFAULTS.retryBackoffMax.ms,
    processingTimeoutMs: QUEUE_DEFAULTS.processingTimeout.ms,
  });
});

Deno.test("limitsFrom converts every duration to milliseconds", () => {
  const limits = limitsFrom({
    retryBackoff: Time.seconds(2),
    retryBackoffMax: Time.minutes(1),
    processingTimeout: Time.seconds(30),
  });

  assertEquals(limits.retryBackoffMs, 2_000);
  assertEquals(limits.retryBackoffMaxMs, 60_000);
  assertEquals(limits.processingTimeoutMs, 30_000);
});

Deno.test("limitsFrom never lets concurrency drop below one worker", () => {
  assertEquals(limitsFrom({ concurrency: 0 }).concurrency, 1);
  assertEquals(limitsFrom({ concurrency: -5 }).concurrency, 1);
});

Deno.test("subjectsOf pairs a live subject with a dead one", () => {
  assertEquals(subjectsOf("mail.send", false), {
    subject: "q.mail_send",
    deadSubject: "dead.mail_send",
  });
  assertEquals(subjectsOf("mail.send", true).subject, "qd.mail_send");
});

Deno.test("planFor keeps the most permissive value of the whole declaration set", () => {
  const plan = planFor([
    queue({ name: "a", maxLen: 10, processingTimeoutMs: 1 }),
    queue({ name: "b", maxLen: 500_000, processingTimeoutMs: 60_000 }),
  ]);

  assertEquals(plan.maxPerSubject, 500_000);
  assertEquals(plan.ackWaitMs, QUEUE_DEFAULTS.processingTimeout.ms);
});

Deno.test("planFor never goes below the defaults, however small a queue asks", () => {
  const plan = planFor([queue({ maxLen: 1, processingTimeoutMs: 1 })]);

  assertEquals(plan.maxPerSubject, QUEUE_DEFAULTS.maxLen);
  assertEquals(plan.ackWaitMs, QUEUE_DEFAULTS.processingTimeout.ms);
});

Deno.test("planFor holds without a single queue declared", () => {
  const plan = planFor([]);

  assertEquals(plan.maxPerSubject, QUEUE_DEFAULTS.maxLen);
  assertEquals(plan.dedicated, []);
});

Deno.test("planFor lets the server deliver for as long as the policy retries", () => {
  const plan = planFor([queue({ maxRetries: 20 }), queue({ maxRetries: 3 })]);

  assertEquals(
    plan.maxDeliver > 20,
    true,
    `the server gives up after ${plan.maxDeliver} deliveries, before the longest policy has `
      + "finished retrying, so that message dies on an advisory and never reaches the dead letter",
  );
});

Deno.test("planFor never lets the server stop before the default policy is done", () => {
  const plan = planFor([queue({ maxRetries: 1 })]);

  assertEquals(plan.maxDeliver > QUEUE_DEFAULTS.maxRetries, true);
});

Deno.test("planFor lists the dedicated queues only", () => {
  const plan = planFor([
    queue({ name: "shared" }),
    queue({ name: "isolated", dedicated: true }),
  ]);

  assertEquals(plan.dedicated, ["isolated"]);
});

Deno.test("planSignature ignores the declaration order", () => {
  const first = planFor([
    queue({ name: "b", dedicated: true }),
    queue({ name: "a", dedicated: true }),
  ]);
  const second = planFor([
    queue({ name: "a", dedicated: true }),
    queue({ name: "b", dedicated: true }),
  ]);

  assertEquals(planSignature(first), planSignature(second));
});

Deno.test("planSignature separates two plans that provision differently", () => {
  assertNotEquals(
    planSignature(planFor([queue({ maxLen: 200_000 })])),
    planSignature(planFor([queue()])),
  );
  assertNotEquals(
    planSignature(planFor([queue({ name: "x", dedicated: true })])),
    planSignature(planFor([queue({ name: "x" })])),
  );
});

Deno.test("graceFor gives a batch queue its own linger window", () => {
  new Queue<{ id: string }>(
    { name: "test:grace:batch", batch: { lingerMs: 1_500 } },
    () => Promise.resolve(),
  );

  assertEquals(graceFor("q.test_grace_batch"), 1_500);
});

Deno.test("graceFor keeps an immediate queue on the short window", () => {
  new Queue<{ id: string }>(
    { name: "test:grace:immediate" },
    () => Promise.resolve(),
  );

  assertEquals(graceFor("q.test_grace_immediate"), IMMEDIATE_GRACE_MS);
});

Deno.test("graceFor falls back to the short window on a batch queue without a linger", () => {
  new Queue<{ id: string }>(
    { name: "test:grace:default", batch: {} },
    () => Promise.resolve(),
  );

  assertEquals(graceFor("q.test_grace_default"), IMMEDIATE_GRACE_MS);
});

Deno.test("graceFor never delays a subject it does not know", () => {
  assertEquals(graceFor("q.never_declared"), IMMEDIATE_GRACE_MS);
});
