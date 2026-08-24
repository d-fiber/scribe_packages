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

import "@scribe/foundation/tests/testing/hand_backs.ts";
import { installDrivers } from "@scribe/foundation/tests/testing/drivers.ts";
import { assertEquals } from "@std/assert";
import { Queue } from "@scribe/foundation/lib/src/queue/queue.ts";
import { MessageDispatcher } from "@scribe/foundation/lib/src/queue/runner/message_dispatcher.ts";
import { DrainTally } from "@scribe/foundation/lib/src/queue/runner/drain_tally.ts";
import { topology } from "@scribe/foundation/lib/src/queue/topology/topology.ts";
import { decode } from "@scribe/foundation/lib/src/queue/wire_message.ts";
import { installMock } from "@scribe/foundation/tests/testing/install.ts";
import type { JsMsg } from "@nats-io/jetstream";

const encoder = new TextEncoder();

interface FakeMsg {
  readonly subject: string;
  readonly data: Uint8Array;
  readonly seq: number;
  readonly info: { deliveryCount: number };
  acked: boolean;
  termed: boolean;
  nakedAfter: number | null;
}

function message(
  subject: string,
  data: unknown,
  deliveryCount = 1,
  seq = 1,
  payload?: Uint8Array,
): FakeMsg {
  const msg: FakeMsg = {
    subject,
    data: payload ?? encoder.encode(JSON.stringify({ data })),
    seq,
    info: { deliveryCount },
    acked: false,
    termed: false,
    nakedAfter: null,
  };
  return Object.assign(msg, {
    ack: () => {
      msg.acked = true;
    },
    term: () => {
      msg.termed = true;
    },
    nak: (millis?: number) => {
      msg.nakedAfter = millis ?? 0;
    },
  });
}

async function dispatch(messages: readonly FakeMsg[]) {
  const published: { subject: string; data: unknown }[] = [];
  const mock = installMock(
    topology,
    "publish",
    (subject: string, payload: Uint8Array) => {
      published.push({ subject, data: decode(payload).data });
      return Promise.resolve("1");
    },
  );

  const tally = new DrainTally();
  try {
    await new MessageDispatcher().dispatch(
      messages as unknown as readonly JsMsg[],
      tally,
    );
  } finally {
    mock.restore();
  }
  return { result: tally.toResult(), published };
}

const failing = () => Promise.reject(new Error("handler blew up"));

const RETRY_QUEUE_MAX_DELIVERIES = 4;
const BATCH_QUEUE_MAX_DELIVERIES = 3;

new Queue<{ id: string }>(
  { name: "test:failure:retry", options: { maxRetries: RETRY_QUEUE_MAX_DELIVERIES } },
  failing,
);
new Queue<{ id: string }>(
  {
    name: "test:failure:batch",
    batch: { lingerMs: 5 },
    options: { maxRetries: BATCH_QUEUE_MAX_DELIVERIES },
  },
  failing,
);

installDrivers();

Deno.test("a failed job is negatively acknowledged, never terminated", async () => {
  const messages = [message("q.test_failure_retry", { id: "a" }, 1)];
  const { result } = await dispatch(messages);

  assertEquals(result.retried, 1);
  assertEquals(messages[0].termed, false, "terminating would drop the job");
  assertEquals(messages[0].acked, false);
  assertEquals(typeof messages[0].nakedAfter, "number");
});

Deno.test("the retry delay grows with the number of deliveries", async () => {
  const first = [message("q.test_failure_retry", { id: "a" }, 1)];
  const third = [message("q.test_failure_retry", { id: "a" }, 3)];

  await dispatch(first);
  await dispatch(third);

  const early = first[0].nakedAfter ?? 0;
  const late = third[0].nakedAfter ?? 0;
  assertEquals(early > 0, true);
  assertEquals(late > early, true, `${late} should exceed ${early}`);
});

Deno.test("the last attempt goes to the dead letter and is terminated", async () => {
  const messages = [message("q.test_failure_retry", { id: "a" }, RETRY_QUEUE_MAX_DELIVERIES)];
  const { result, published } = await dispatch(messages);

  assertEquals(result.dead, 1);
  assertEquals(result.retried, 0);
  assertEquals(messages[0].termed, true);
  assertEquals(messages[0].nakedAfter, null, "a dead job must not come back");
  assertEquals(published, [
    { subject: "dead.test_failure_retry", data: { id: "a" } },
  ]);
});

Deno.test("a failed batch sends every one of its messages through the policy", async () => {
  const messages = [
    message("q.test_failure_batch", { id: "a" }, 1, 1),
    message("q.test_failure_batch", { id: "b" }, 1, 2),
  ];
  const { result } = await dispatch(messages);

  assertEquals(result.retried, 2);
  assertEquals(messages.every((m) => m.nakedAfter !== null), true);
});

Deno.test("a batch carries each message's own delivery count", async () => {
  const justArrived = message("q.test_failure_batch", { id: "a" }, 1, 1);
  const onItsLastAttempt = message(
    "q.test_failure_batch",
    { id: "b" },
    BATCH_QUEUE_MAX_DELIVERIES,
    2,
  );
  const { result } = await dispatch([justArrived, onItsLastAttempt]);

  assertEquals(result.retried, 1);
  assertEquals(result.dead, 1);
  assertEquals(
    justArrived.nakedAfter !== null,
    true,
    "the message on its first delivery came back for another attempt",
  );
  assertEquals(
    onItsLastAttempt.termed,
    true,
    "the message that had used up its deliveries gave up, in the same batch",
  );
});

Deno.test("a payload published before the envelope shrank still decodes", async () => {
  const messages = [
    message(
      "q.test_failure_retry",
      null,
      1,
      1,
      encoder.encode(JSON.stringify({ data: { id: "a" }, attempts: 2 })),
    ),
  ];

  const { result } = await dispatch(messages);

  assertEquals(result.retried, 1, "an old message must not be lost on deploy");
});
