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

import { installDrivers } from "@scribe/foundation/tests/testing/drivers.ts";
import {
  limitsFrom,
  QUEUE_DEFAULTS,
  type RegisteredQueue,
  subjectsOf,
} from "@scribe/foundation/lib/src/queue/queue_declaration.ts";
import { planFor, planSignature } from "@scribe/foundation/lib/src/queue/topology/topology_plan.ts";
import { Queue } from "@scribe/foundation/lib/src/queue/queue.ts";
import { graceFor, IMMEDIATE_GRACE_MS } from "@scribe/foundation/lib/src/queue/runner/grace_period.ts";
import { Duration } from "@scribe/alchemy";
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

installDrivers();

Deno.test("limitsFrom falls back to the declared defaults", () => {
  assertEquals(limitsFrom(), {
    maxRetries: QUEUE_DEFAULTS.maxRetries,
    maxLen: QUEUE_DEFAULTS.maxLen,
    concurrency: QUEUE_DEFAULTS.concurrency,
    retryBackoffMs: QUEUE_DEFAULTS.retryBackoff.inMilliseconds,
    retryBackoffMaxMs: QUEUE_DEFAULTS.retryBackoffMax.inMilliseconds,
    processingTimeoutMs: QUEUE_DEFAULTS.processingTimeout.inMilliseconds,
  });
});

Deno.test("limitsFrom converts every duration to milliseconds", () => {
  const limits = limitsFrom({
    retryBackoff: Duration.seconds(2),
    retryBackoffMax: Duration.minutes(1),
    processingTimeout: Duration.seconds(30),
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
  assertEquals(plan.ackWaitMs, QUEUE_DEFAULTS.processingTimeout.inMilliseconds);
});

Deno.test("planFor never goes below the defaults, however small a queue asks", () => {
  const plan = planFor([queue({ maxLen: 1, processingTimeoutMs: 1 })]);

  assertEquals(plan.maxPerSubject, QUEUE_DEFAULTS.maxLen);
  assertEquals(plan.ackWaitMs, QUEUE_DEFAULTS.processingTimeout.inMilliseconds);
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
    `the server gives up after ${plan.maxDeliver} deliveries, before the longest policy has ` +
      "finished retrying, so that message dies on an advisory and never reaches the dead letter",
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
