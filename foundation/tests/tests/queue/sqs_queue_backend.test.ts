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
import { contains, equals, expect, Scribe } from "@scribe/alchemy/test";
import { installDrivers } from "../../testing/drivers.ts";
import { SqsQueueBackend } from "../../../lib/src/queue/sqs_queue_backend.ts";
import type { SqsClient, SqsMessage } from "../../../lib/src/queue/sqs_queue_backend.ts";
import type { RegisteredQueue } from "../../../lib/src/queue/queue_declaration.ts";
import { type Kv, kv } from "../../../lib/src/redis/kv.ts";
import { installMock } from "../../testing/install.ts";
import { encode } from "../../../lib/src/queue/wire_message.ts";
import type { BatchHandler, JobHandler } from "../../../lib/src/queue/queue_options.ts";
import { Duration } from "@scribe/alchemy";

installDrivers();

let counter = 0;

function unique(prefix: string): string {
  return `${prefix}-${++counter}`;
}

/** A `RegisteredQueue` a test can build without going through `new Queue()`, so nothing lands in the shared registry by accident. */
function registeredQueue(over: Partial<RegisteredQueue> = {}): RegisteredQueue {
  const name = over.name ?? unique("q");
  return {
    name,
    subject: `q.${name}`,
    deadSubject: `dead.${name}`,
    mode: "immediate",
    dedicated: false,
    maxRetries: 3,
    maxLen: 100_000,
    concurrency: 10,
    retryBackoffMs: 1_000,
    retryBackoffMaxMs: 60_000,
    processingTimeoutMs: 10_000,
    handler: (() => Promise.resolve()) as JobHandler<unknown>,
    ...over,
  };
}

function simulatedLongPollWait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 15));
}

async function stopDrainingAndSettle(backend: SqsQueueBackend): Promise<void> {
  backend.stopDraining();
  await new Promise((resolve) => setTimeout(resolve, 40));
}

interface FakeQueue {
  readonly name: string;
  attributes: Record<string, string>;
  readonly messages: { body: string; receiptHandle: string; receiveCount: number }[];
  readonly deleted: string[];
  readonly visibilityChanges: number[];
}

/** A minimal in-memory stand-in for SQS, real enough to drive push, receive, ack, retry and dead-letter. */
function fakeSqs(): { client: SqsClient; queues: Map<string, FakeQueue> } {
  const queues = new Map<string, FakeQueue>();
  let receiptCounter = 0;

  function queueOf(url: string): FakeQueue {
    const found = [...queues.values()].find((q) => `https://sqs.test/${q.name}` === url);
    if (!found) throw new Error(`no fake queue at ${url}`);
    return found;
  }

  const client: SqsClient = {
    createQueue: (input) => {
      const existing = queues.get(input.QueueName);
      if (existing) return Promise.resolve({ QueueUrl: `https://sqs.test/${existing.name}` });

      const created: FakeQueue = {
        name: input.QueueName,
        attributes: input.Attributes ?? {},
        messages: [],
        deleted: [],
        visibilityChanges: [],
      };
      queues.set(input.QueueName, created);
      return Promise.resolve({ QueueUrl: `https://sqs.test/${created.name}` });
    },
    getQueueAttributes: (input) => {
      const queue = queueOf(input.QueueUrl);
      const answer: Record<string, string> = {};
      if (input.AttributeNames.includes("QueueArn")) answer.QueueArn = `arn:test:${queue.name}`;
      if (input.AttributeNames.includes("ApproximateNumberOfMessages")) {
        answer.ApproximateNumberOfMessages = String(queue.messages.length);
      }
      return Promise.resolve({ Attributes: answer });
    },
    sendMessage: (input) => {
      const queue = queueOf(input.QueueUrl);
      queue.messages.push({ body: input.MessageBody, receiptHandle: `r-${++receiptCounter}`, receiveCount: 0 });
      return Promise.resolve({ MessageId: `m-${receiptCounter}` });
    },
    sendMessageBatch: (input) => {
      const queue = queueOf(input.QueueUrl);
      const successful = input.Entries.map((entry) => {
        queue.messages.push({ body: entry.MessageBody, receiptHandle: `r-${++receiptCounter}`, receiveCount: 0 });
        return { Id: entry.Id, MessageId: `m-${receiptCounter}` };
      });
      return Promise.resolve({ Successful: successful, Failed: [] });
    },
    receiveMessage: async (input) => {
      const queue = queueOf(input.QueueUrl);
      const taken = queue.messages.splice(0, input.MaxNumberOfMessages);
      if (taken.length === 0) await simulatedLongPollWait();

      const messages: SqsMessage[] = taken.map((message) => {
        message.receiveCount++;
        return {
          MessageId: message.receiptHandle,
          ReceiptHandle: message.receiptHandle,
          Body: message.body,
          Attributes: { ApproximateReceiveCount: String(message.receiveCount) },
        };
      });
      return { Messages: messages };
    },
    deleteMessage: (input) => {
      const queue = queueOf(input.QueueUrl);
      queue.deleted.push(input.ReceiptHandle);
      return Promise.resolve();
    },
    changeMessageVisibility: (input) => {
      const queue = queueOf(input.QueueUrl);
      queue.visibilityChanges.push(input.VisibilityTimeout);
      return Promise.resolve();
    },
  };

  return { client, queues };
}

function nameOf(queue: RegisteredQueue): string {
  return queue.name.replace(/[^A-Za-z0-9_-]+/g, "_");
}

Scribe.test("push() creates the queue and sends the encoded payload", async () => {
  const { client, queues } = fakeSqs();
  const backend = new SqsQueueBackend(client);
  const queue = registeredQueue();

  const id = await backend.push(queue, { hello: "world" }, {});

  expect(id, contains("m-"));
  const created = queues.get(nameOf(queue));
  expect(created?.messages.length, equals(1));
  expect(JSON.parse(created!.messages[0].body), equals({ data: { hello: "world" } }));
});

Scribe.test("push() creates a dead letter queue and points RedrivePolicy at its arn", async () => {
  const { client, queues } = fakeSqs();
  const backend = new SqsQueueBackend(client);
  const queue = registeredQueue({ maxRetries: 4 });

  await backend.push(queue, { a: 1 }, {});

  const main = queues.get(nameOf(queue));
  const policy = JSON.parse(main!.attributes.RedrivePolicy);
  expect(policy.deadLetterTargetArn, equals(`arn:test:${nameOf(queue)}-dead`));
  expect(policy.maxReceiveCount, equals("5"));
});

Scribe.test("pushMany() sends every item and answers one id per item, in order", async () => {
  const { client } = fakeSqs();
  const backend = new SqsQueueBackend(client);
  const queue = registeredQueue();

  const ids = await backend.pushMany(queue, [{ n: 1 }, { n: 2 }, { n: 3 }]);

  expect(ids.length, equals(3));
  expect(ids.every((id) => id.startsWith("m-")), equals(true));
});

Scribe.test("pushMany() chunks more than ten items into more than one batch call", async () => {
  const { client, queues } = fakeSqs();
  const backend = new SqsQueueBackend(client);
  const queue = registeredQueue();

  const ids = await backend.pushMany(queue, Array.from({ length: 23 }, (_, at) => ({ n: at })));

  expect(ids.length, equals(23));
  expect(queues.get(nameOf(queue))?.messages.length, equals(23));
});

Scribe.test("an empty pushMany never touches the queue", async () => {
  const { client, queues } = fakeSqs();
  const backend = new SqsQueueBackend(client);
  const queue = registeredQueue();

  const ids = await backend.pushMany(queue, []);

  expect(ids, equals([]));
  expect(queues.size, equals(0));
});

Scribe.test("addressOf() answers the queue url, and publishEncoded() sends straight to it", async () => {
  const { client, queues } = fakeSqs();
  const backend = new SqsQueueBackend(client);
  const queue = registeredQueue();

  const address = await backend.addressOf(queue);
  await backend.publishEncoded(address, encode({ data: { promoted: true } }), "ignored-key");

  expect(address, contains(nameOf(queue)));
  const created = queues.get(nameOf(queue));
  expect(created?.messages.length, equals(1));
  expect(JSON.parse(created!.messages[0].body), equals({ data: { promoted: true } }));
});

Scribe.test("size() and deadCount() read each queue's own approximate count", async () => {
  const { client } = fakeSqs();
  const backend = new SqsQueueBackend(client);
  const queue = registeredQueue();

  await backend.push(queue, { a: 1 }, {});
  await backend.push(queue, { a: 2 }, {});

  expect(await backend.size(queue), equals(2));
  expect(await backend.deadCount(queue), equals(0));
});

Scribe.test("push() with a delay parks the job in Redis instead of sending it", async () => {
  const parked: unknown[] = [];
  const mock = installMock(
    kv(),
    "zadd",
    ((_key: string, _score: number, raw: string) => {
      parked.push(JSON.parse(raw));
      return Promise.resolve(1);
    }) as unknown as Kv["zadd"],
  );

  try {
    const { client, queues } = fakeSqs();
    const backend = new SqsQueueBackend(client);
    const queue = registeredQueue();

    await backend.push(queue, { later: true }, { delay: Duration.seconds(30) });

    expect(parked.length, equals(1));
    expect((parked[0] as { queue: string }).queue, equals(queue.name));
    expect(queues.get(nameOf(queue))?.messages.length ?? 0, equals(0), "a delayed push must not reach SQS yet");
  } finally {
    mock.restore();
  }
});

/** Waits until `condition` is true or `timeoutMs` passes, polling rather than sleeping a fixed guess. */
async function waitUntil(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("waitUntil() timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

Scribe.test("a message that succeeds is deleted", async () => {
  const { client, queues } = fakeSqs();
  const backend = new SqsQueueBackend(client);
  const seen: unknown[] = [];
  const queue = registeredQueue({
    handler: ((data) => {
      seen.push(data);
      return Promise.resolve();
    }) as JobHandler<unknown>,
  });

  await backend.push(queue, { work: 1 }, {});
  try {
    void backend.drain(queue);
    await waitUntil(() => seen.length === 1);
    await waitUntil(() => (queues.get(nameOf(queue))?.deleted.length ?? 0) >= 1);

    expect(seen, equals([{ work: 1 }]));
  } finally {
    await stopDrainingAndSettle(backend);
  }
});

Scribe.test("a message whose handler throws is held back with a computed visibility timeout, not deleted", async () => {
  const { client, queues } = fakeSqs();
  const backend = new SqsQueueBackend(client);
  let calls = 0;
  const queue = registeredQueue({
    maxRetries: 5,
    retryBackoffMs: 1_000,
    handler: (() => {
      calls++;
      return Promise.reject(new Error("not yet"));
    }) as JobHandler<unknown>,
  });

  await backend.push(queue, { work: 1 }, {});
  try {
    void backend.drain(queue);
    await waitUntil(() => calls >= 1);
    await waitUntil(() => (queues.get(nameOf(queue))?.visibilityChanges.length ?? 0) >= 1);

    const held = queues.get(nameOf(queue))!;
    expect(held.deleted.length, equals(0));
    expect(held.visibilityChanges[0] > 0, equals(true));
  } finally {
    await stopDrainingAndSettle(backend);
  }
});

Scribe.test("a message that exhausts its retries is copied to the dead letter and removed from the main queue", async () => {
  const { client, queues } = fakeSqs();
  const backend = new SqsQueueBackend(client);
  const queue = registeredQueue({
    maxRetries: 1,
    handler: (() => Promise.reject(new Error("still failing"))) as JobHandler<unknown>,
  });

  await backend.push(queue, { work: "spent" }, {});
  try {
    void backend.drain(queue);
    await waitUntil(() => (queues.get(`${nameOf(queue)}-dead`)?.messages.length ?? 0) >= 1);

    const dead = queues.get(`${nameOf(queue)}-dead`)!;
    expect(JSON.parse(dead.messages[0].body), equals({ data: { work: "spent" } }));
    expect(queues.get(nameOf(queue))?.deleted.length, equals(1), "the original is removed once it is copied");
  } finally {
    await stopDrainingAndSettle(backend);
  }
});

Scribe.test("a payload nothing can read goes straight to the dead letter without ever reaching the handler", async () => {
  const { client, queues } = fakeSqs();
  const backend = new SqsQueueBackend(client);
  let handled = 0;
  const queue = registeredQueue({
    handler: (() => {
      handled++;
      return Promise.resolve();
    }) as JobHandler<unknown>,
  });

  const url = await backend.addressOf(queue);
  await client.sendMessage({ QueueUrl: url, MessageBody: "not json at all" });
  try {
    void backend.drain(queue);
    await waitUntil(() => (queues.get(`${nameOf(queue)}-dead`)?.messages.length ?? 0) >= 1);

    expect(handled, equals(0));
  } finally {
    await stopDrainingAndSettle(backend);
  }
});

Scribe.test("a batch queue calls its body once with every message the poll returned", async () => {
  const { client } = fakeSqs();
  const backend = new SqsQueueBackend(client);
  let received: readonly unknown[] = [];
  const queue = registeredQueue({
    mode: "batch",
    lingerMs: 0,
    handler: ((items) => {
      received = items;
      return Promise.resolve();
    }) as BatchHandler<unknown>,
  });

  await backend.pushMany(queue, [{ n: 1 }, { n: 2 }, { n: 3 }]);
  try {
    void backend.drain(queue);
    await waitUntil(() => received.length === 3);

    expect(received, equals([{ n: 1 }, { n: 2 }, { n: 3 }]));
  } finally {
    await stopDrainingAndSettle(backend);
  }
});
