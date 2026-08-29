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
import { equals, expect, isNot, Scribe } from "@scribe/alchemy/test";
import { installDrivers } from "../../testing/drivers.ts";
import {
  limitsFrom,
  QUEUE_DEFAULTS,
  type RegisteredQueue,
  subjectsOf,
} from "../../../lib/src/queue/queue_declaration.ts";
import { planFor, planSignature } from "../../../lib/src/queue/topology/topology_plan.ts";
import { Queue } from "../../../lib/src/queue/queue.ts";
import { graceFor, IMMEDIATE_GRACE_MS } from "../../../lib/src/queue/runner/grace_period.ts";
import { Duration } from "@scribe/alchemy";

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

Scribe.test("limitsFrom falls back to the declared defaults", () => {
  expect(
    limitsFrom(),
    equals({
      maxRetries: QUEUE_DEFAULTS.maxRetries,
      maxLen: QUEUE_DEFAULTS.maxLen,
      concurrency: QUEUE_DEFAULTS.concurrency,
      retryBackoffMs: QUEUE_DEFAULTS.retryBackoff.inMilliseconds,
      retryBackoffMaxMs: QUEUE_DEFAULTS.retryBackoffMax.inMilliseconds,
      processingTimeoutMs: QUEUE_DEFAULTS.processingTimeout.inMilliseconds,
    }),
  );
});

Scribe.test("limitsFrom converts every duration to milliseconds", () => {
  const limits = limitsFrom({
    retryBackoff: Duration.seconds(2),
    retryBackoffMax: Duration.minutes(1),
    processingTimeout: Duration.seconds(30),
  });

  expect(limits.retryBackoffMs, equals(2_000));
  expect(limits.retryBackoffMaxMs, equals(60_000));
  expect(limits.processingTimeoutMs, equals(30_000));
});

Scribe.test("limitsFrom never lets concurrency drop below one worker", () => {
  expect(limitsFrom({ concurrency: 0 }).concurrency, equals(1));
  expect(limitsFrom({ concurrency: -5 }).concurrency, equals(1));
});

Scribe.test("subjectsOf pairs a live subject with a dead one", () => {
  expect(
    subjectsOf("mail.send", false),
    equals({
      subject: "q.mail_send",
      deadSubject: "dead.mail_send",
    }),
  );
  expect(subjectsOf("mail.send", true).subject, equals("qd.mail_send"));
});

Scribe.test("planFor keeps the most permissive value of the whole declaration set", () => {
  const plan = planFor([
    queue({ name: "a", maxLen: 10, processingTimeoutMs: 1 }),
    queue({ name: "b", maxLen: 500_000, processingTimeoutMs: 60_000 }),
  ]);

  expect(plan.maxPerSubject, equals(500_000));
  expect(plan.ackWaitMs, equals(QUEUE_DEFAULTS.processingTimeout.inMilliseconds));
});

Scribe.test("planFor never goes below the defaults, however small a queue asks", () => {
  const plan = planFor([queue({ maxLen: 1, processingTimeoutMs: 1 })]);

  expect(plan.maxPerSubject, equals(QUEUE_DEFAULTS.maxLen));
  expect(plan.ackWaitMs, equals(QUEUE_DEFAULTS.processingTimeout.inMilliseconds));
});

Scribe.test("planFor holds without a single queue declared", () => {
  const plan = planFor([]);

  expect(plan.maxPerSubject, equals(QUEUE_DEFAULTS.maxLen));
  expect(plan.dedicated, equals([]));
});

Scribe.test("planFor lets the server deliver for as long as the policy retries", () => {
  const plan = planFor([queue({ maxRetries: 20 }), queue({ maxRetries: 3 })]);

  expect(
    plan.maxDeliver > 20,
    equals(true),
    `the server gives up after ${plan.maxDeliver} deliveries, before the longest policy has ` +
      "finished retrying, so that message dies on an advisory and never reaches the dead letter",
  );
});

Scribe.test("planFor never lets the server stop before the default policy is done", () => {
  const plan = planFor([queue({ maxRetries: 1 })]);

  expect(plan.maxDeliver > QUEUE_DEFAULTS.maxRetries, equals(true));
});

Scribe.test("planFor lists the dedicated queues only", () => {
  const plan = planFor([
    queue({ name: "shared" }),
    queue({ name: "isolated", dedicated: true }),
  ]);

  expect(plan.dedicated, equals(["isolated"]));
});

Scribe.test("planSignature ignores the declaration order", () => {
  const first = planFor([
    queue({ name: "b", dedicated: true }),
    queue({ name: "a", dedicated: true }),
  ]);
  const second = planFor([
    queue({ name: "a", dedicated: true }),
    queue({ name: "b", dedicated: true }),
  ]);

  expect(planSignature(first), equals(planSignature(second)));
});

Scribe.test("planSignature separates two plans that provision differently", () => {
  expect(planSignature(planFor([queue({ maxLen: 200_000 })])), isNot(equals(planSignature(planFor([queue()])))));
  expect(
    planSignature(planFor([queue({ name: "x", dedicated: true })])),
    isNot(equals(planSignature(planFor([queue({ name: "x" })])))),
  );
});

Scribe.test("graceFor gives a batch queue its own linger window", () => {
  new Queue<{ id: string }>(
    { name: "test:grace:batch", batch: { lingerMs: 1_500 } },
    () => Promise.resolve(),
  );

  expect(graceFor("q.test_grace_batch"), equals(1_500));
});

Scribe.test("graceFor keeps an immediate queue on the short window", () => {
  new Queue<{ id: string }>(
    { name: "test:grace:immediate" },
    () => Promise.resolve(),
  );

  expect(graceFor("q.test_grace_immediate"), equals(IMMEDIATE_GRACE_MS));
});

Scribe.test("graceFor falls back to the short window on a batch queue without a linger", () => {
  new Queue<{ id: string }>(
    { name: "test:grace:default", batch: {} },
    () => Promise.resolve(),
  );

  expect(graceFor("q.test_grace_default"), equals(IMMEDIATE_GRACE_MS));
});

Scribe.test("graceFor never delays a subject it does not know", () => {
  expect(graceFor("q.never_declared"), equals(IMMEDIATE_GRACE_MS));
});
