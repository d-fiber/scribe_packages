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

// Retry and the dead letter used to need a real NATS and a real Redis to exercise, because
// a failed message was terminated and rewritten into a sorted set. Now that a retry is a
// negative acknowledgement, the whole policy is one call on the message, and a fake one is
// enough to hold it.

import { assertEquals } from "@std/assert";
import { defineQueue } from "@scribe/foundation/src/queue/mod.ts";
import { MessageDispatcher } from "@scribe/foundation/src/queue/runner/dispatcher.ts";
import { DrainTally } from "@scribe/foundation/src/queue/runner/drain_tally.ts";
import { topology } from "@scribe/foundation/src/queue/core/topology/topology.ts";
import { decode } from "@scribe/foundation/src/queue/core/wire.ts";
import { installMock } from "@scribe/core/testing/install.ts";
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

defineQueue<{ id: string }>(
  { name: "test:failure:retry", options: { maxRetries: 4 } },
  failing,
);
defineQueue<{ id: string }>(
  { name: "test:failure:batch", batch: { lingerMs: 5 }, options: { maxRetries: 3 } },
  failing,
);

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
  // maxRetries is 4, so the fourth delivery is the one that gives up.
  const messages = [message("q.test_failure_retry", { id: "a" }, 4)];
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
  // One message of the batch is on its last attempt while the other has just arrived.
  const messages = [
    message("q.test_failure_batch", { id: "a" }, 1, 1),
    message("q.test_failure_batch", { id: "b" }, 3, 2),
  ];
  const { result } = await dispatch(messages);

  assertEquals(result.retried, 1);
  assertEquals(result.dead, 1);
  assertEquals(messages[0].nakedAfter !== null, true);
  assertEquals(messages[1].termed, true);
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
