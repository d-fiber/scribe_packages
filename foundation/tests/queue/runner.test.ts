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

// Since the move to a shared stream (2026-08-09), the runner no longer takes
// injectable `Drainable`s: it reads the dispatch table (`queueRegistry`) and
// splits a mixed batch by subject. The core testable without NATS or Redis is
// therefore `dispatch()`: grouping, batch vs job-by-job mode, the ack, and the
// fate of an orphan subject.
//
// Not covered here, as the previous engine was not either: retry and the dead
// letter, which require a real NATS + Redis instance (see .claude/testing.md).

import { assertEquals } from "@std/assert";
import { Queue } from "@scribe/foundation/src/queue/mod.ts";
import { MessageDispatcher } from "@scribe/foundation/src/queue/runner/dispatcher.ts";
import { DrainTally } from "@scribe/foundation/src/queue/runner/drain_tally.ts";

import type { JsMsg } from "@nats-io/jetstream";

async function dispatch(messages: readonly JsMsg[]) {
  const tally = new DrainTally();
  await new MessageDispatcher().dispatch(messages, tally);
  return tally.toResult();
}

const encoder = new TextEncoder();

interface FakeMsg {
  readonly subject: string;
  readonly data: Uint8Array;
  readonly seq: number;
  // How many times the server says it has handed this message out. It is where the attempt
  // count comes from now, so a fake that leaves it out no longer stands for a real message.
  readonly info: { deliveryCount: number };
  acked: boolean;
  termed: boolean;
  naked: boolean;
}

function message(subject: string, data: unknown, seq = 1): FakeMsg {
  const msg: FakeMsg = {
    subject,
    data: encoder.encode(JSON.stringify({ data })),
    seq,
    info: { deliveryCount: 1 },
    acked: false,
    termed: false,
    naked: false,
  };
  return Object.assign(msg, {
    ack: () => {
      msg.acked = true;
    },
    term: () => {
      msg.termed = true;
    },
    nak: () => {
      msg.naked = true;
    },
  });
}

function asJsMsgs(messages: readonly FakeMsg[]): readonly JsMsg[] {
  return messages as unknown as readonly JsMsg[];
}

Deno.test("dispatch() calls the body job by job and acks", async () => {
  const seen: string[] = [];
  new Queue<{ id: string }>({ name: "test:dispatch:immediate" }, (job) => {
    seen.push(job.id);
    return Promise.resolve();
  });

  const messages = [
    message("q.test_dispatch_immediate", { id: "a" }, 1),
    message("q.test_dispatch_immediate", { id: "b" }, 2),
  ];
  const result = await dispatch(asJsMsgs(messages));

  assertEquals(seen, ["a", "b"]);
  assertEquals(result.done, 2);
  assertEquals(messages.every((m) => m.acked), true);
});

Deno.test("dispatch() calls the body once with the whole batch in batch mode", async () => {
  let calls = 0;
  let received: readonly unknown[] = [];
  new Queue<{ id: string }>(
    { name: "test:dispatch:batch", batch: { lingerMs: 10 } },
    (jobs) => {
      calls++;
      received = jobs;
      return Promise.resolve();
    },
  );

  const messages = [
    message("q.test_dispatch_batch", { id: "a" }, 1),
    message("q.test_dispatch_batch", { id: "b" }, 2),
    message("q.test_dispatch_batch", { id: "c" }, 3),
  ];
  const result = await dispatch(asJsMsgs(messages));

  assertEquals(calls, 1);
  assertEquals(received.length, 3);
  assertEquals(result.done, 3);
});

Deno.test("dispatch() splits a mixed batch by queue", async () => {
  const first: string[] = [];
  const second: string[] = [];
  new Queue<{ id: string }>({ name: "test:dispatch:mixed-a" }, (job) => {
    first.push(job.id);
    return Promise.resolve();
  });
  new Queue<{ id: string }>({ name: "test:dispatch:mixed-b" }, (job) => {
    second.push(job.id);
    return Promise.resolve();
  });

  await dispatch(
    asJsMsgs([
      message("q.test_dispatch_mixed-a", { id: "a1" }, 1),
      message("q.test_dispatch_mixed-b", { id: "b1" }, 2),
      message("q.test_dispatch_mixed-a", { id: "a2" }, 3),
    ]),
  );

  assertEquals(first, ["a1", "a2"]);
  assertEquals(second, ["b1"]);
});

Deno.test("dispatch() discards an orphan subject instead of blocking the consumer", async () => {
  const messages = [message("q.gone_queue", { id: "x" }, 1)];

  const result = await dispatch(asJsMsgs(messages));

  assertEquals(messages[0].termed, true);
  assertEquals(messages[0].acked, false);
  assertEquals(result.done, 0);
});
