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

import { Duration, ExponentialBackoff, Future, runPooled, type UnmodifiableList, withDeadline } from "@scribe/alchemy";
import { log } from "@scribe/alchemy/observe";
import { PubSub } from "@google-cloud/pubsub";
import type { RegisteredQueue } from "./queue_declaration.ts";
import type { BatchHandler, JobHandler, PushOptions, QueueMessage } from "./queue_options.ts";
import type { QueueBackend } from "./queue_backend.ts";
import type { QueueStatus } from "./queue_status.ts";
import { queueSettings } from "./queue_settings.ts";
import { queueRegistry } from "./queue_registry.ts";
import { delayedCounts } from "./delayed/delayed_counts.ts";
import { pushDelayed } from "./delayed/delayed_schedule.ts";
import { encode, safeDecode, type WireMessage } from "./wire_message.ts";

/** How many messages a batch queue groups before it stops waiting for company, whatever `lingerMs` still allows. */
const MAX_BATCH = 10;

/** A message as this backend reads it, the surface `@google-cloud/pubsub`'s own `Message` carries that matters here. */
export interface PubSubMessage {
  readonly id: string;
  readonly data: Uint8Array;
  readonly deliveryAttempt?: number;
  ack(): void;
  nack(): void;
  /** Extends how long this message stays invisible by `deadlineSeconds`, the way SQS's `ChangeMessageVisibility` does. */
  modAck(deadlineSeconds: number): void;
}

/** A live pull stream for one subscription, opened by {@link PubSubClient.pull}. */
export interface PubSubStream {
  on(event: "message", handler: (message: PubSubMessage) => void): void;
  on(event: "error", handler: (error: unknown) => void): void;
  close(): Future<void>;
}

/** What ensuring a subscription takes: the deadline, the dead letter, and its own retry backoff. */
export interface EnsureSubscription {
  readonly subscriptionName: string;
  readonly topicName: string;
  readonly ackDeadlineSeconds: number;
  readonly deadLetterTopic: string;
  readonly maxDeliveryAttempts: number;
  readonly minimumBackoffSeconds: number;
  readonly maximumBackoffSeconds: number;
}

/**
 * What this backend needs from Google Cloud Pub/Sub, narrow enough for a test to fake without
 * constructing real `@google-cloud/pubsub` topics, subscriptions or streams.
 *
 * @remarks
 * `ensureTopic` and `ensureSubscription` are idempotent by contract: {@link RealPubSubClient} is
 * where the real client's `ALREADY_EXISTS` error is caught and treated as success, so nothing
 * above this interface has to know Pub/Sub throws on a second creation where SQS answers the
 * same queue back.
 */
export interface PubSubClient {
  ensureTopic(name: string): Future<void>;
  ensureSubscription(input: EnsureSubscription): Future<void>;
  publish(topicName: string, data: Uint8Array): Future<string>;
  /** Opens a pull stream on `subscriptionName`, delivering at most `maxMessages` unacknowledged at once. */
  pull(subscriptionName: string, maxMessages: number): PubSubStream;
}

/** The real client, wrapping `@google-cloud/pubsub`'s own topics, subscriptions and streams behind {@link PubSubClient}. */
export class RealPubSubClient implements PubSubClient {
  readonly #client: PubSub;

  constructor(projectId: string) {
    this.#client = new PubSub({ projectId });
  }

  async ensureTopic(name: string): Future<void> {
    try {
      await this.#client.createTopic(name);
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
  }

  async ensureSubscription(input: EnsureSubscription): Future<void> {
    const topic = this.#client.topic(input.topicName);

    try {
      await topic.createSubscription(input.subscriptionName, {
        ackDeadlineSeconds: input.ackDeadlineSeconds,
        deadLetterPolicy: {
          deadLetterTopic: this.#client.topic(input.deadLetterTopic).name,
          maxDeliveryAttempts: input.maxDeliveryAttempts,
        },
        retryPolicy: {
          minimumBackoff: { seconds: input.minimumBackoffSeconds },
          maximumBackoff: { seconds: input.maximumBackoffSeconds },
        },
      });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
  }

  async publish(topicName: string, data: Uint8Array): Future<string> {
    return await this.#client.topic(topicName).publishMessage({ data });
  }

  pull(subscriptionName: string, maxMessages: number): PubSubStream {
    const subscription = this.#client.subscription(subscriptionName, { flowControl: { maxMessages } });

    return {
      on: (event: "message" | "error", handler: ((message: PubSubMessage) => void) | ((error: unknown) => void)) => {
        if (event === "message") {
          subscription.on(
            "message",
            ((message: RealMessage) => (handler as (message: PubSubMessage) => void)(message)) as never,
          );
        } else {
          subscription.on("error", handler as (error: unknown) => void);
        }
      },
      close: () => subscription.close(),
    };
  }
}

/** The shape `@google-cloud/pubsub`'s own `Message` carries that {@link PubSubMessage} mirrors. */
interface RealMessage {
  readonly id: string;
  readonly data: Uint8Array;
  readonly deliveryAttempt?: number;
  ack(): void;
  nack(): void;
  modAck(deadlineSeconds: number): void;
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === 6;
}

/**
 * Reduces a queue name to what Pub/Sub accepts as a topic or subscription id: 3 to 255
 * characters, starting with a letter, the rest letters, digits, or `-_.~+%`.
 *
 * @remarks
 * A colon, which this codebase's own queue names use as a namespacing separator, is not in that
 * set, so it is folded into an underscore along with anything else the charset refuses. See
 * `sqs_queue_backend.ts`'s own `sqsName` for the same trade against a different charset and a
 * different length ceiling; the two are not shared for the reason given there.
 */
function pubsubName(name: string, suffix = ""): string {
  const budget = 255 - suffix.length;
  const sanitized = ("q-" + name.replace(/[^A-Za-z0-9_.~+%-]+/g, "_")).slice(0, budget);
  return `${sanitized}${suffix}`;
}

interface Readable {
  readonly message: PubSubMessage;
  readonly wire: WireMessage<unknown>;
  readonly attempts: number;
}

/**
 * Moves a queue's messages over Google Cloud Pub/Sub: one topic and one pull subscription per
 * declared queue, each with its own dead-letter topic, drained through the client library's own
 * streaming pull rather than a hand-rolled poll loop, which is what Google's own guidance
 * recommends over synchronous pull for anything that is not a one-off script.
 *
 * @remarks
 * Like {@link SqsQueueBackend}, there is no equivalent of JetStream's shared consumer: every
 * declared queue opens a stream of its own, dedicated or not, and that is a real difference in
 * cost from {@link NatsQueueBackend}, not a gap.
 *
 * Retrying is `modAck`, Pub/Sub's own extend-the-deadline call, given the backoff this queue's
 * own declaration asks for, mirroring what `ChangeMessageVisibility` does for SQS. Dead-lettering
 * is done twice over: this class copies a spent message to the dead-letter topic and acks the
 * original itself, the same manual policy `FailurePolicy` applies for NATS, and the subscription
 * also carries a native `deadLetterPolicy` one delivery more permissive, as a backstop for a
 * replica that dies mid-answer, exactly as `sqs_queue_backend.ts` does for SQS's `RedrivePolicy`.
 *
 * `size()` and `deadCount()` answer 0 and log why. Counting a subscription's backlog is served by
 * Cloud Monitoring, a separate API this driver does not call, and inventing a number from what
 * `@google-cloud/pubsub` alone can answer would be a guess dressed as a measurement.
 *
 * Pub/Sub does not deduplicate a publish by an idempotency key the way NATS's duplicate window
 * does, so `publishEncoded`'s key is accepted and ignored: see `sqs_queue_backend.ts`'s own doc
 * for what that costs under two replicas racing to promote the same delayed job, which applies
 * here identically.
 */
export class PubSubQueueBackend implements QueueBackend {
  readonly #client: PubSubClient;
  readonly #ensured = new Set<string>();
  readonly #streams = new Map<string, PubSubStream>();
  #stopped = true;

  constructor(client?: PubSubClient) {
    if (client) {
      this.#client = client;
      return;
    }

    const settings = queueSettings.get();
    if (settings.driver !== "pubsub") {
      throw new Error(`PubSubQueueBackend was built, but the configured queue driver is "${settings.driver}".`);
    }
    this.#client = new RealPubSubClient(settings.projectId);
  }

  async push<T>(queue: RegisteredQueue, data: T, opts: PushOptions): Future<string> {
    if (opts.delay && opts.delay.inMilliseconds > 0) {
      return await pushDelayed(queue.name, await this.addressOf(queue), data, opts.delay);
    }

    await this.#ensure(queue);
    return await this.#client.publish(this.#topicOf(queue), encode({ data }));
  }

  async addressOf(queue: RegisteredQueue): Future<string> {
    await this.#ensure(queue);
    return this.#topicOf(queue);
  }

  /**
   * Publishes every item of `items`, one publish per item.
   *
   * Not atomic, the same trade `sqs_queue_backend.ts`'s own `pushMany` documents: a failure part
   * way through leaves the items before it already published, which the port's own "all or
   * nothing" cannot be honoured against a broker with no batch publish of its own.
   */
  async pushMany<T>(queue: RegisteredQueue, items: UnmodifiableList<T>): Future<string[]> {
    if (items.length === 0) return [];

    await this.#ensure(queue);
    const topic = this.#topicOf(queue);
    const ids: string[] = new Array(items.length);
    await runPooled([...items.keys()], MAX_BATCH, async (at) => {
      ids[at] = await this.#client.publish(topic, encode({ data: items[at] }));
    });
    return ids;
  }

  /** Publishes `payload` directly to `address`, a topic name {@link addressOf} resolved earlier. */
  async publishEncoded(address: string, payload: Uint8Array, _idempotencyKey: string): Future<string> {
    return await this.#client.publish(address, payload);
  }

  size(_queue: RegisteredQueue): Future<number> {
    log.warn("queue.pubsub_count_unavailable", {
      metadata: { reason: "counting a subscription's backlog needs Cloud Monitoring, which this driver does not call" },
    });
    return Promise.resolve(0);
  }

  deadCount(_queue: RegisteredQueue): Future<number> {
    log.warn("queue.pubsub_count_unavailable", {
      metadata: { reason: "counting a subscription's backlog needs Cloud Monitoring, which this driver does not call" },
    });
    return Promise.resolve(0);
  }

  async delayedCount(queue: RegisteredQueue): Future<number> {
    const delayed = await delayedCounts();
    return delayed.counts[queue.name] ?? 0;
  }

  async status(queue: RegisteredQueue): Future<QueueStatus> {
    const [pending, dead, delayed] = await Future.wait([
      this.size(queue),
      this.deadCount(queue),
      this.delayedCount(queue),
    ]);

    return { name: queue.name, mode: queue.mode, dedicated: queue.dedicated, pending, dead, delayed };
  }

  /** Opens one pull stream per registered queue. Does nothing when already draining. */
  startDraining(): void {
    if (!this.#stopped) return;
    this.#stopped = false;

    for (const queue of queueRegistry.list()) {
      void this.drain(queue);
    }
  }

  stopDraining(): void {
    this.#stopped = true;
    for (const stream of this.#streams.values()) void stream.close();
    this.#streams.clear();
  }

  /**
   * Opens `queue`'s own pull stream, whether or not it is registered.
   *
   * @remarks
   * `startDraining` is what a host calls, once, for every declared queue at once. This is what it
   * calls per queue, and it is public so a test can open one queue's own stream directly instead
   * of going through the shared registry every other declared queue in the same process also sits
   * in.
   *
   * It clears `#stopped` itself rather than relying on `startDraining` to have done it, so a
   * caller that reaches this directly still gets a stream that actually delivers.
   */
  async drain(queue: RegisteredQueue): Future<void> {
    this.#stopped = false;
    await this.#ensure(queue);
    const stream = this.#client.pull(this.#topicOf(queue), Math.max(1, queue.concurrency));
    this.#streams.set(queue.name, stream);

    stream.on("error", (error) => {
      log.error("queue.pubsub_stream_failed", { metadata: { queue: queue.name, error } });
    });

    if (queue.mode === "immediate") {
      stream.on("message", (message) => {
        if (this.#stopped) return message.nack();
        void this.#processOne(queue, message);
      });
      return;
    }

    let batch: PubSubMessage[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      if (batch.length === 0) return;
      const collected = batch;
      batch = [];
      void this.#processBatch(queue, collected);
    };

    stream.on("message", (message) => {
      if (this.#stopped) return message.nack();

      batch.push(message);
      if (batch.length >= MAX_BATCH) {
        if (timer !== null) clearTimeout(timer);
        flush();
        return;
      }
      if (timer === null) timer = setTimeout(flush, queue.lingerMs ?? 0);
    });
  }

  #topicOf(queue: RegisteredQueue): string {
    return pubsubName(queue.name);
  }

  #deadLetterTopicOf(queue: RegisteredQueue): string {
    return pubsubName(queue.name, "-dead");
  }

  async #ensure(queue: RegisteredQueue): Future<void> {
    if (this.#ensured.has(queue.name)) return;

    const backoff = this.#backoffFor(queue);
    await this.#client.ensureTopic(this.#topicOf(queue));
    await this.#client.ensureTopic(this.#deadLetterTopicOf(queue));
    await this.#client.ensureSubscription({
      subscriptionName: this.#topicOf(queue),
      topicName: this.#topicOf(queue),
      ackDeadlineSeconds: this.#ackDeadlineSeconds(queue),
      deadLetterTopic: this.#deadLetterTopicOf(queue),
      maxDeliveryAttempts: Math.min(100, Math.max(5, queue.maxRetries + 1)),
      minimumBackoffSeconds: Math.max(0, Math.round(backoff.delayFor(1).inMilliseconds / 1000)),
      maximumBackoffSeconds: Math.min(600, Math.max(1, Math.round(queue.retryBackoffMaxMs / 1000))),
    });

    this.#ensured.add(queue.name);
  }

  async #processOne(queue: RegisteredQueue, message: PubSubMessage): Future<void> {
    const wire = safeDecode<unknown>(message.data);
    if (wire === null) return this.#discard(queue, message);

    const attempts = message.deliveryAttempt ?? 1;
    const envelope: QueueMessage<unknown> = { id: message.id, data: wire.data, attempts };

    try {
      await withDeadline(
        `queue:${queue.name}`,
        Duration.milliseconds(queue.processingTimeoutMs),
        (queue.handler as JobHandler<unknown>)(envelope.data, envelope),
      );
      message.ack();
    } catch (error) {
      log.error("queue.handler_failed", { metadata: { queue: queue.name, messages: 1, error } });
      await this.#fail(queue, message, attempts);
    }
  }

  async #processBatch(queue: RegisteredQueue, messages: readonly PubSubMessage[]): Future<void> {
    const readable: Readable[] = [];
    for (const message of messages) {
      const wire = safeDecode<unknown>(message.data);
      if (wire === null) {
        this.#discard(queue, message);
        continue;
      }
      readable.push({ message, wire, attempts: message.deliveryAttempt ?? 1 });
    }
    if (readable.length === 0) return;

    try {
      await withDeadline(
        `queue:${queue.name}`,
        Duration.milliseconds(queue.processingTimeoutMs),
        (queue.handler as BatchHandler<unknown>)(readable.map((one) => one.wire.data)),
      );
    } catch (error) {
      log.error("queue.handler_failed", { metadata: { queue: queue.name, messages: readable.length, error } });
      await runPooled(readable, queue.concurrency, (one) => this.#fail(queue, one.message, one.attempts));
      return;
    }

    for (const one of readable) one.message.ack();
  }

  /** Sends a message nothing can read straight to the dead letter, the bytes forwarded as they arrived. */
  #discard(queue: RegisteredQueue, message: PubSubMessage): void {
    log.error("queue.payload_unreadable", {
      metadata: { queue: queue.name, consequence: "the message goes straight to the dead letter" },
    });

    this.#client.publish(this.#deadLetterTopicOf(queue), message.data)
      .then(() => message.ack())
      .catch((error) => {
        log.error("queue.discard_failed", { metadata: { queue: queue.name, error } });
        message.modAck(this.#ackDeadlineSeconds(queue));
      });
  }

  /** Answers for a message whose body refused: another attempt, or the dead letter. */
  async #fail(queue: RegisteredQueue, message: PubSubMessage, attempts: number): Future<void> {
    if (attempts >= queue.maxRetries) {
      try {
        await this.#client.publish(this.#deadLetterTopicOf(queue), message.data);
        message.ack();
      } catch (error) {
        log.error("queue.dead_letter_failed", { metadata: { queue: queue.name, error } });
        message.modAck(this.#backoffSeconds(queue, attempts));
      }
      return;
    }

    message.modAck(this.#backoffSeconds(queue, attempts));
  }

  #backoffFor(queue: RegisteredQueue): ExponentialBackoff {
    return new ExponentialBackoff(
      Duration.milliseconds(queue.retryBackoffMs),
      Duration.milliseconds(queue.retryBackoffMaxMs),
    );
  }

  #backoffSeconds(queue: RegisteredQueue, attempts: number): number {
    const delayMs = this.#backoffFor(queue).delayFor(attempts).inMilliseconds;
    return Math.max(0, Math.round(delayMs / 1000));
  }

  #ackDeadlineSeconds(queue: RegisteredQueue): number {
    return Math.max(10, Math.min(600, Math.ceil(queue.processingTimeoutMs / 1000)));
  }
}
