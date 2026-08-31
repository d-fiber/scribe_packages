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

import "@scribe/runtime/scholium/runner.ts";
import { equals, expect, Scribe } from "@scribe/alchemy/test";
import { installDrivers } from "../../testing/drivers.ts";
import type { MemoryLogger } from "../../testing/logger.ts";
import { Queue } from "../../../lib/src/queue/queue.ts";
import { Duration } from "@scribe/alchemy";
import { dispatchProbes, type Probe, probe } from "./probe.ts";
const logger: MemoryLogger = installDrivers();

const RETRIES = 4;

let refusals = 0;
let writes = 0;
const seen: number[] = [];

new Queue<{ id: string }>(
  { name: "test:budget:flaky", options: { maxRetries: RETRIES, concurrency: 1 } },
  (_job, message) => {
    seen.push(message.attempts);
    refusals++;
    return refusals >= 3 ? Promise.resolve() : Promise.reject(new Error("not yet"));
  },
);

new Queue<{ id: string }>(
  { name: "test:budget:always", options: { maxRetries: RETRIES } },
  () => Promise.reject(new Error("never works")),
);

new Queue<{ id: string }>(
  {
    name: "test:budget:writes",
    options: { maxRetries: RETRIES },
  },
  () => {
    writes++;
    return Promise.reject(new Error("wrote, then refused"));
  },
);

new Queue<{ id: string }>(
  {
    name: "test:budget:endless",
    options: { maxRetries: RETRIES, processingTimeout: Duration.milliseconds(5) },
  },
  () => new Promise<void>(() => {}),
);

function attempt(subject: string, deliveryCount: number): Probe {
  return probe({ subject, data: { id: "a" }, deliveryCount });
}

Scribe.test("a body that refuses twice and then agrees is acknowledged on its third delivery", async () => {
  refusals = 0;
  seen.length = 0;

  const first = attempt("q.test_budget_flaky", 1);
  const second = attempt("q.test_budget_flaky", 2);
  const third = attempt("q.test_budget_flaky", 3);

  const one = await dispatchProbes([first]);
  const two = await dispatchProbes([second]);
  const three = await dispatchProbes([third]);

  expect([one.result.retried, two.result.retried, three.result.done], equals([1, 1, 1]));
  expect([first.acked, second.acked, third.acked], equals([false, false, true]));
  expect(seen, equals([1, 2, 3]), "the body reads the server's own delivery count as its attempt");
  expect(three.published, equals([]));
});

Scribe.test("a body that never agrees is refused up to its ceiling and then terminated", async () => {
  const answers: string[] = [];
  let dead = 0;

  for (let delivery = 1; delivery <= RETRIES + 2; delivery++) {
    const message = attempt("q.test_budget_always", delivery);
    const { result } = await dispatchProbes([message]);

    dead += result.dead;
    answers.push(message.termed ? "term" : `nak:${message.nakedAfter}`);
  }

  expect(answers.slice(0, RETRIES - 1).every((one) => one.startsWith("nak:")), equals(true));
  expect(answers.slice(RETRIES - 1).every((one) => one === "term"), equals(true));
  expect(
    dead,
    equals(3),
    "term() is what stops the redelivery, so every delivery from maxRetries onwards writes " +
      "the payload to the dead letter again: a term the server never received duplicates it",
  );
});

Scribe.test("a delivery count one past the ceiling still reaches the dead letter", async () => {
  const message = attempt("q.test_budget_always", RETRIES + 1);

  const { result, published } = await dispatchProbes([message]);

  expect(result.dead, equals(1));
  expect(message.termed, equals(true));
  expect(published.map((one) => one.subject), equals(["dead.test_budget_always"]));
});

Scribe.test("a server that restarts the count at zero makes the job immortal", async () => {
  const answers: number[] = [];

  for (let round = 0; round < RETRIES + 3; round++) {
    const message = attempt("q.test_budget_always", 0);
    await dispatchProbes([message]);
    answers.push(message.nakedAfter ?? -1);
  }

  expect(
    answers.every((one) => one > 0),
    equals(true),
    "the policy reads the count the server sends and has no memory of its own, so a count " +
      "stuck at zero never reaches the dead letter: max_deliver on the consumer is the only " +
      "thing that ever stops it",
  );
});

Scribe.test("a body that never finishes is refused on the deadline, not left hanging", async () => {
  const message = attempt("q.test_budget_endless", 1);

  const { result } = await dispatchProbes([message]);

  expect(result.retried, equals(1));
  expect(typeof message.nakedAfter, equals("number"));
  expect(message.acked, equals(false));
});

Scribe.test("a body that writes before it refuses is asked to write again", async () => {
  writes = 0;

  await dispatchProbes([attempt("q.test_budget_writes", 1)]);
  await dispatchProbes([attempt("q.test_budget_writes", 2)]);

  expect(
    writes,
    equals(2),
    "delivery is at least once and a refusal does not undo what the body already did, which " +
      "is the whole reason a body has to be idempotent",
  );
});

Scribe.test("the retry delay stops doubling at the declared ceiling", async () => {
  const early = attempt("q.test_budget_always", 1);
  const late = attempt("q.test_budget_always", 3);

  await dispatchProbes([early]);
  await dispatchProbes([late]);

  expect(early.nakedAfter, equals(1_000));
  expect(late.nakedAfter, equals(4_000));
});

Scribe.test("a subject nothing declares is refused with a delay, never terminated", async () => {
  const message = probe({ subject: "q.test_budget_nobody", data: { id: "a" } });

  const { result } = await dispatchProbes([message]);

  expect(message.termed, equals(false));
  expect(message.acked, equals(false));
  expect(message.nakedAfter, equals(30_000));
  expect(result, equals({ done: 0, retried: 1, dead: 0, promoted: 0 }));
});

Scribe.test("a hand-back is counted nowhere, so a process refusing all of its traffic reports an idle drain", async () => {
  const messages = [
    probe({ subject: "q.test_budget_nobody", data: { id: "a" }, seq: 1 }),
    probe({ subject: "q.test_budget_nobody", data: { id: "b" }, seq: 2 }),
  ];

  const { result } = await dispatchProbes(messages);

  expect(
    result.retried,
    equals(2),
    "a drain that refused everything it was handed answers the same four zeros as a drain " +
      "that was handed nothing, so nothing an operator watches can tell the two apart",
  );
});

Scribe.test("hand-backs spend the retry budget of the process that does know the subject", async () => {
  const handedBack = 3;

  for (let delivery = 1; delivery <= handedBack; delivery++) {
    const refused = probe({
      subject: "q.test_budget_handover",
      data: { id: "a" },
      deliveryCount: delivery,
    });
    await dispatchProbes([refused]);
    expect(refused.nakedAfter, equals(30_000));
  }

  new Queue<{ id: string }>(
    { name: "test:budget:handover", options: { maxRetries: RETRIES } },
    () => Promise.reject(new Error("transient")),
  );

  const arriving = probe({
    subject: "q.test_budget_handover",
    data: { id: "a" },
    deliveryCount: handedBack + 1,
  });
  const { result } = await dispatchProbes([arriving]);

  expect(
    result.dead,
    equals(0),
    "the deliveries a replica spent refusing a subject it does not declare are read by the " +
      "replica that does declare it as attempts its body already made, so a job entitled " +
      `to ${RETRIES} tries is buried after one`,
  );
  expect(arriving.termed, equals(false));
});

Scribe.test("the same message delivered twice inside one fetch is answered twice", async () => {
  const twin = () => probe({ subject: "q.test_budget_always", data: { id: "a" }, deliveryCount: RETRIES, seq: 7 });
  const first = twin();
  const second = twin();

  const { result, published } = await dispatchProbes([first, second]);

  expect(result.dead, equals(2));
  expect(
    published.length,
    equals(2),
    "one job reaches the dead letter twice, which is the price of at-least-once delivery and " +
      "the reason a dead-letter reader has to key on the payload rather than count rows",
  );
});

Scribe.test("a hand-back says on the log which subject it refused and how many it held", async () => {
  logger.clear();

  await dispatchProbes([
    probe({ subject: "q.test_budget_nobody", data: { id: "a" }, seq: 1 }),
    probe({ subject: "q.test_budget_nobody", data: { id: "b" }, seq: 2 }),
  ]);

  const line = logger.lines.find((one) => one.action === "queue.subject_undeclared");
  const metadata = line?.input?.metadata as Record<string, unknown> | undefined;

  expect(line?.level, equals("warn"));
  expect(metadata?.subject, equals("q.test_budget_nobody"));
  expect(metadata?.handedBack, equals(2));
});
