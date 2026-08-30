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
import "@scribe/runtime/scholium/runner.ts";
import { equals, expect, Scribe } from "@scribe/alchemy/test";
import "../../testing/hand_backs.ts";
import { installDrivers } from "../../testing/drivers.ts";
import { Queue } from "../../../lib/src/queue/queue.ts";
import { MessageDispatcher } from "../../../lib/src/queue/runner/message_dispatcher.ts";
import { DrainTally } from "../../../lib/src/queue/runner/drain_tally.ts";

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

installDrivers();

Scribe.test("dispatch() calls the body job by job and acks", async () => {
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

  expect(seen, equals(["a", "b"]));
  expect(result.done, equals(2));
  expect(messages.every((m) => m.acked), equals(true));
});

Scribe.test("dispatch() calls the body once with the whole batch in batch mode", async () => {
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

  expect(calls, equals(1));
  expect(received.length, equals(3));
  expect(result.done, equals(3));
});

Scribe.test("dispatch() splits a mixed batch by queue", async () => {
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

  expect(first, equals(["a1", "a2"]));
  expect(second, equals(["b1"]));
});

Scribe.test("dispatch() hands a subject this process does not declare back, it does not destroy it", async () => {
  const messages = [message("q.owned_by_another_package", { id: "x" }, 1)];

  const result = await dispatch(asJsMsgs(messages));

  expect(messages[0].termed, equals(false), "another replica may be the one that declares it");
  expect(messages[0].naked, equals(true), "and it comes back rather than holding its slot");
  expect(messages[0].acked, equals(false));
  expect(result.done, equals(0));
});
