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
import { PubSubQueueBackend } from "../../../lib/src/queue/pubsub_queue_backend.ts";
import type {
  EnsureSubscription,
  PubSubClient,
  PubSubMessage,
  PubSubStream,
} from "../../../lib/src/queue/pubsub_queue_backend.ts";
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

interface FakeMessage extends PubSubMessage {
  acked: boolean;
  nacked: boolean;
  modAcks: number[];
}

interface FakeStream extends PubSubStream {
  deliver(message: FakeMessage): void;
}

/** A minimal in-memory stand-in for Pub/Sub: topics hold published bytes, a pull stream delivers them once a handler attaches. */
function fakePubSub(): {
  client: PubSubClient;
  topics: Map<string, Uint8Array[]>;
  subscriptions: Map<string, EnsureSubscription>;
  streamFor: Map<string, FakeStream>;
  deliveries: FakeMessage[];
} {
  const topics = new Map<string, Uint8Array[]>();
  const subscriptions = new Map<string, EnsureSubscription>();
  const streamFor = new Map<string, FakeStream>();
  const backlog = new Map<string, FakeMessage[]>();
  const deliveries: FakeMessage[] = [];
  let messageId = 0;

  function drain(subscriptionName: string): void {
    const stream = streamFor.get(subscriptionName);
    const queue = backlog.get(subscriptionName);
    if (!stream || !queue) return;

    while (queue.length > 0) {
      const message = queue.shift()!;
      queueMicrotask(() => stream.deliver(message));
    }
  }

  const client: PubSubClient = {
    ensureTopic: (name) => {
      if (!topics.has(name)) topics.set(name, []);
      return Promise.resolve();
    },
    ensureSubscription: (input) => {
      subscriptions.set(input.subscriptionName, input);
      return Promise.resolve();
    },
    publish: (topicName, data) => {
      const held = topics.get(topicName);
      if (!held) throw new Error(`no fake topic "${topicName}"`);
      held.push(data);

      const message: FakeMessage = {
        id: `m-${++messageId}`,
        data,
        deliveryAttempt: 1,
        acked: false,
        nacked: false,
        modAcks: [],
        ack() {
          this.acked = true;
        },
        nack() {
          this.nacked = true;
        },
        modAck(seconds: number) {
          this.modAcks.push(seconds);
        },
      };
      deliveries.push(message);

      const pending = backlog.get(topicName) ?? [];
      pending.push(message);
      backlog.set(topicName, pending);
      drain(topicName);

      return Promise.resolve(message.id);
    },
    pull: (subscriptionName) => {
      const handlers: { message?: (message: PubSubMessage) => void; error?: (error: unknown) => void } = {};
      const stream: FakeStream = {
        on: (event, handler) => {
          if (event === "message") handlers.message = handler as (message: PubSubMessage) => void;
          else handlers.error = handler as (error: unknown) => void;
          drain(subscriptionName);
        },
        close: () => {
          streamFor.delete(subscriptionName);
          return Promise.resolve();
        },
        deliver: (message) => {
          handlers.message?.(message);
        },
      };
      streamFor.set(subscriptionName, stream);
      return stream;
    },
  };

  return { client, topics, subscriptions, streamFor, deliveries };
}

function nameOf(queue: RegisteredQueue): string {
  return `q-${queue.name.replace(/[^A-Za-z0-9_.~+%-]+/g, "_")}`;
}

async function stopDrainingAndSettle(backend: PubSubQueueBackend): Promise<void> {
  backend.stopDraining();
  await new Promise((resolve) => setTimeout(resolve, 40));
}

Scribe.test("push() ensures the topic and subscription, and publishes the encoded payload", async () => {
  const { client, topics } = fakePubSub();
  const backend = new PubSubQueueBackend(client);
  const queue = registeredQueue();

  await backend.push(queue, { hello: "world" }, {});

  const published = topics.get(nameOf(queue));
  expect(published?.length, equals(1));
  const decoded = JSON.parse(new TextDecoder().decode(published![0]));
  expect(decoded, equals({ data: { hello: "world" } }));
});

Scribe.test("push() configures the subscription's dead letter and retry policy from the queue's own declaration", async () => {
  const { client, subscriptions } = fakePubSub();
  const backend = new PubSubQueueBackend(client);
  const queue = registeredQueue({ maxRetries: 4, retryBackoffMaxMs: 120_000 });

  await backend.push(queue, { a: 1 }, {});

  const subscription = subscriptions.get(nameOf(queue));
  expect(subscription?.deadLetterTopic, equals(`${nameOf(queue)}-dead`));
  expect(subscription?.maxDeliveryAttempts, equals(5));
  expect(subscription?.maximumBackoffSeconds, equals(120));
});

Scribe.test("pushMany() publishes every item and answers one id per item", async () => {
  const { client, topics } = fakePubSub();
  const backend = new PubSubQueueBackend(client);
  const queue = registeredQueue();

  const ids = await backend.pushMany(queue, [{ n: 1 }, { n: 2 }, { n: 3 }]);

  expect(ids.length, equals(3));
  expect(topics.get(nameOf(queue))?.length, equals(3));
});

Scribe.test("an empty pushMany never touches a topic", async () => {
  const { client, topics } = fakePubSub();
  const backend = new PubSubQueueBackend(client);
  const queue = registeredQueue();

  const ids = await backend.pushMany(queue, []);

  expect(ids, equals([]));
  expect(topics.size, equals(0));
});

Scribe.test("addressOf() answers the topic name, and publishEncoded() publishes straight to it", async () => {
  const { client, topics } = fakePubSub();
  const backend = new PubSubQueueBackend(client);
  const queue = registeredQueue();

  const address = await backend.addressOf(queue);
  await backend.publishEncoded(address, encode({ data: { promoted: true } }), "ignored-key");

  expect(address, equals(nameOf(queue)));
  expect(topics.get(nameOf(queue))?.length, equals(1));
});

Scribe.test("size() and deadCount() answer 0 rather than guess", async () => {
  const { client } = fakePubSub();
  const backend = new PubSubQueueBackend(client);
  const queue = registeredQueue();

  expect(await backend.size(queue), equals(0));
  expect(await backend.deadCount(queue), equals(0));
});

Scribe.test("push() with a delay parks the job in Redis instead of publishing it", async () => {
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
    const { client, topics } = fakePubSub();
    const backend = new PubSubQueueBackend(client);
    const queue = registeredQueue();

    await backend.push(queue, { later: true }, { delay: Duration.seconds(30) });

    expect(parked.length, equals(1));
    expect((parked[0] as { queue: string }).queue, equals(queue.name));
    expect(topics.get(nameOf(queue))?.length ?? 0, equals(0), "a delayed push must not publish yet");
  } finally {
    mock.restore();
  }
});

async function waitUntil(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("waitUntil() timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

Scribe.test("a message that succeeds is acked", async () => {
  const { client } = fakePubSub();
  const backend = new PubSubQueueBackend(client);
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

    expect(seen, equals([{ work: 1 }]));
  } finally {
    await stopDrainingAndSettle(backend);
  }
});

Scribe.test("a message whose handler throws is held back with modAck, not acked", async () => {
  const { client, deliveries } = fakePubSub();
  const backend = new PubSubQueueBackend(client);
  let calls = 0;
  const queue = registeredQueue({
    maxRetries: 5,
    handler: (() => {
      calls++;
      return Promise.reject(new Error("not yet"));
    }) as JobHandler<unknown>,
  });

  await backend.push(queue, { work: 1 }, {});
  try {
    void backend.drain(queue);
    await waitUntil(() => calls >= 1);
    await waitUntil(() => deliveries.length >= 1 && deliveries[0].modAcks.length > 0);

    expect(deliveries[0].acked, equals(false));
    expect(deliveries[0].modAcks[0] > 0, equals(true));
  } finally {
    await stopDrainingAndSettle(backend);
  }
});

Scribe.test("a message that exhausts its retries is copied to the dead letter and acked", async () => {
  const { client, topics } = fakePubSub();
  const backend = new PubSubQueueBackend(client);
  const queue = registeredQueue({
    maxRetries: 1,
    handler: (() => Promise.reject(new Error("still failing"))) as JobHandler<unknown>,
  });

  await backend.push(queue, { work: "spent" }, {});
  try {
    void backend.drain(queue);
    await waitUntil(() => (topics.get(`${nameOf(queue)}-dead`)?.length ?? 0) >= 1);

    const dead = topics.get(`${nameOf(queue)}-dead`)!;
    const decoded = JSON.parse(new TextDecoder().decode(dead[0]));
    expect(decoded, equals({ data: { work: "spent" } }));
  } finally {
    await stopDrainingAndSettle(backend);
  }
});

Scribe.test("a payload nothing can read goes straight to the dead letter without ever reaching the handler", async () => {
  const { client, topics } = fakePubSub();
  const backend = new PubSubQueueBackend(client);
  let handled = 0;
  const queue = registeredQueue({
    handler: (() => {
      handled++;
      return Promise.resolve();
    }) as JobHandler<unknown>,
  });

  const topicName = await backend.addressOf(queue);
  await client.publish(topicName, new TextEncoder().encode("not json at all"));
  try {
    void backend.drain(queue);
    await waitUntil(() => (topics.get(`${nameOf(queue)}-dead`)?.length ?? 0) >= 1);

    expect(handled, equals(0));
  } finally {
    await stopDrainingAndSettle(backend);
  }
});

Scribe.test("a batch queue groups what arrives before lingerMs into one call", async () => {
  const { client } = fakePubSub();
  const backend = new PubSubQueueBackend(client);
  let received: readonly unknown[] = [];
  const queue = registeredQueue({
    mode: "batch",
    lingerMs: 200,
    handler: ((items) => {
      received = items;
      return Promise.resolve();
    }) as BatchHandler<unknown>,
  });

  try {
    void backend.drain(queue);
    await backend.push(queue, { n: 1 }, {});
    await backend.push(queue, { n: 2 }, {});
    await backend.push(queue, { n: 3 }, {});

    await waitUntil(() => received.length === 3);
    expect(received, equals([{ n: 1 }, { n: 2 }, { n: 3 }]));
  } finally {
    await stopDrainingAndSettle(backend);
  }
});
