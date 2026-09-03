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
import {
  ChangeMessageVisibilityCommand,
  CreateQueueCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  type QueueAttributeName,
  ReceiveMessageCommand,
  SendMessageBatchCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import type { RegisteredQueue } from "./queue_declaration.ts";
import type { BatchHandler, JobHandler, PushOptions, QueueMessage } from "./queue_options.ts";
import type { QueueBackend } from "./queue_backend.ts";
import type { QueueStatus } from "./queue_status.ts";
import { queueSettings } from "./queue_settings.ts";
import { queueRegistry } from "./queue_registry.ts";
import { delayedCounts } from "./delayed/delayed_counts.ts";
import { pushDelayed } from "./delayed/delayed_schedule.ts";
import { encode, safeDecode, type WireMessage } from "./wire_message.ts";

/** How long a receive with nothing waiting is prepared to hold the connection open, in seconds. */
const LONG_POLL_SECONDS = 20;

/** How many messages one receive call is allowed to return; SQS refuses to answer more. */
const MAX_RECEIVE = 10;

/** How long a drain loop waits before trying again after a receive it could not complete. */
const RECEIVE_RETRY_DELAY = Duration.seconds(1);

/** A message as `receiveMessage` answers it, the fields this backend reads and nothing else. */
export interface SqsMessage {
  readonly MessageId?: string;
  readonly ReceiptHandle?: string;
  readonly Body?: string;
  readonly Attributes?: Record<string, string>;
}

/**
 * What this backend needs from Amazon SQS, one method per operation rather than one `send` that
 * takes a command object.
 *
 * @remarks
 * A test fakes this directly, with plain objects and functions, rather than having to construct
 * real `@aws-sdk/client-sqs` command instances and reason about `SQSClient.send`'s overloaded
 * return type. {@link RealSqsClient} is the only file that imports a command class.
 */
export interface SqsClient {
  createQueue(input: { QueueName: string; Attributes?: Record<string, string> }): Future<{ QueueUrl?: string }>;
  getQueueAttributes(
    input: { QueueUrl: string; AttributeNames: string[] },
  ): Future<{ Attributes?: Record<string, string> }>;
  sendMessage(input: { QueueUrl: string; MessageBody: string }): Future<{ MessageId?: string }>;
  sendMessageBatch(
    input: { QueueUrl: string; Entries: { Id: string; MessageBody: string }[] },
  ): Future<{ Successful?: { Id: string; MessageId: string }[]; Failed?: { Id: string; Message?: string }[] }>;
  receiveMessage(
    input: { QueueUrl: string; MaxNumberOfMessages: number; WaitTimeSeconds: number },
  ): Future<{ Messages?: SqsMessage[] }>;
  deleteMessage(input: { QueueUrl: string; ReceiptHandle: string }): Future<void>;
  changeMessageVisibility(input: { QueueUrl: string; ReceiptHandle: string; VisibilityTimeout: number }): Future<void>;
}

/** The real client, wrapping `@aws-sdk/client-sqs`'s own commands behind {@link SqsClient}. */
export class RealSqsClient implements SqsClient {
  readonly #client: SQSClient;

  constructor(region: string) {
    this.#client = new SQSClient({ region });
  }

  async createQueue(input: { QueueName: string; Attributes?: Record<string, string> }): Future<{ QueueUrl?: string }> {
    return await this.#client.send(new CreateQueueCommand(input));
  }

  async getQueueAttributes(
    input: { QueueUrl: string; AttributeNames: string[] },
  ): Future<{ Attributes?: Record<string, string> }> {
    return await this.#client.send(
      new GetQueueAttributesCommand({ ...input, AttributeNames: input.AttributeNames as QueueAttributeName[] }),
    );
  }

  async sendMessage(input: { QueueUrl: string; MessageBody: string }): Future<{ MessageId?: string }> {
    return await this.#client.send(new SendMessageCommand(input));
  }

  async sendMessageBatch(
    input: { QueueUrl: string; Entries: { Id: string; MessageBody: string }[] },
  ): Future<{ Successful?: { Id: string; MessageId: string }[]; Failed?: { Id: string; Message?: string }[] }> {
    const answer = await this.#client.send(new SendMessageBatchCommand(input));
    return {
      Successful: answer.Successful
        ?.filter((entry) => entry.Id !== undefined && entry.MessageId !== undefined)
        .map((entry) => ({ Id: entry.Id!, MessageId: entry.MessageId! })),
      Failed: answer.Failed?.map((entry) => ({ Id: entry.Id ?? "", Message: entry.Message })),
    };
  }

  async receiveMessage(
    input: { QueueUrl: string; MaxNumberOfMessages: number; WaitTimeSeconds: number },
  ): Future<{ Messages?: SqsMessage[] }> {
    return await this.#client.send(
      new ReceiveMessageCommand({ ...input, MessageSystemAttributeNames: ["ApproximateReceiveCount"] }),
    );
  }

  async deleteMessage(input: { QueueUrl: string; ReceiptHandle: string }): Future<void> {
    await this.#client.send(new DeleteMessageCommand(input));
  }

  async changeMessageVisibility(
    input: { QueueUrl: string; ReceiptHandle: string; VisibilityTimeout: number },
  ): Future<void> {
    await this.#client.send(new ChangeMessageVisibilityCommand(input));
  }
}

/**
 * Reduces a queue name to what SQS accepts as a `QueueName`: up to 80 characters, letters,
 * digits, hyphens and underscores.
 *
 * @remarks
 * `suffix` is appended after truncation, so the dead letter of a queue whose sanitized name is
 * already 80 characters still fits its own name rather than SQS refusing it for length. Two
 * declared names that differ only past the 80th character, or only in a character this charset
 * cannot carry, reduce to the same `QueueName` and collide; `queue_naming.ts`'s own `sanitize`
 * catches the second case already, since `Queue`'s constructor always derives a NATS-shaped
 * subject regardless of which backend is configured, but the length truncation is new here and
 * has no such guard.
 */
function sqsName(name: string, suffix = ""): string {
  const budget = 80 - suffix.length;
  const sanitized = name.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, budget);
  return `${sanitized}${suffix}`;
}

interface Readable {
  readonly message: SqsMessage;
  readonly wire: WireMessage<unknown>;
  readonly attempts: number;
}

/**
 * Moves a queue's messages over Amazon SQS: one physical queue per declared queue, each with its
 * own dead-letter queue and its own long-polling drain loop.
 *
 * @remarks
 * SQS has nothing like JetStream's shared consumer pulling across every queue's subject in one
 * fetch, so every queue this backend drains costs a loop of its own, whether or not it declared
 * itself dedicated. That is a real difference from {@link NatsQueueBackend}'s cost profile, not
 * an implementation gap: a deployment with a thousand queues opens a thousand long polls under
 * this backend and one or two under NATS's.
 *
 * Retrying and dead-lettering are done by this class itself, the same way {@link FailurePolicy}
 * does them for NATS, rather than left entirely to SQS's own `RedrivePolicy`: a failed message is
 * held back with `ChangeMessageVisibility` for the queue's own backoff schedule, and a spent one
 * is copied to the dead letter and deleted explicitly. `RedrivePolicy` is still set, one delivery
 * more permissive than the queue's own `maxRetries`, as the same backstop
 * `topology_plan.ts`'s `maxDeliver` is for NATS: a replica that dies between receiving a message
 * and answering for it should not be able to leave that message stuck forever.
 *
 * Standard SQS queues do not deduplicate a publish by an idempotency key. Two replicas racing to
 * promote the same delayed job, or a caller retrying a `push` that actually reached SQS before
 * the acknowledgement it was waiting on was lost, can therefore each land a real duplicate
 * message, where NATS's own duplicate window would have dropped the second one. A handler must
 * already be idempotent under this port's at-least-once contract, so this changes how often the
 * second delivery happens, not whether a handler has to tolerate it.
 */
export class SqsQueueBackend implements QueueBackend {
  readonly #client: SqsClient;
  readonly #urls = new Map<string, string>();
  readonly #deadUrls = new Map<string, string>();
  readonly #deadArns = new Map<string, string>();
  #stopped = true;

  constructor(client?: SqsClient) {
    if (client) {
      this.#client = client;
      return;
    }

    const settings = queueSettings.get();
    if (settings.driver !== "sqs") {
      throw new Error(`SqsQueueBackend was built, but the configured queue driver is "${settings.driver}".`);
    }
    this.#client = new RealSqsClient(settings.region);
  }

  async push<T>(queue: RegisteredQueue, data: T, opts: PushOptions): Future<string> {
    if (opts.delay && opts.delay.inMilliseconds > 0) {
      return await pushDelayed(queue.name, await this.addressOf(queue), data, opts.delay);
    }

    const url = await this.#ensureQueue(queue);
    const answer = await this.#client.sendMessage({ QueueUrl: url, MessageBody: this.#bodyOf(data) });
    return answer.MessageId ?? crypto.randomUUID();
  }

  addressOf(queue: RegisteredQueue): Future<string> {
    return this.#ensureQueue(queue);
  }

  /**
   * Publishes every item of `items`, in chunks of at most ten, `SendMessageBatchCommand`'s own
   * ceiling.
   *
   * @remarks
   * A batch is not atomic the way the port's own doc promises: SQS answers each entry of a chunk
   * on its own, and a chunk that partly fails leaves the entries before it already sent. A failure
   * here throws with every failed entry's id and reason, but chunks already sent are not undone,
   * which the port's "either it takes them all or it takes none" cannot be honoured against a
   * broker with no such operation.
   */
  async pushMany<T>(queue: RegisteredQueue, items: UnmodifiableList<T>): Future<string[]> {
    if (items.length === 0) return [];

    const url = await this.#ensureQueue(queue);
    const ids: string[] = new Array(items.length);

    for (let at = 0; at < items.length; at += MAX_RECEIVE) {
      const chunk = items.slice(at, at + MAX_RECEIVE);
      const entries = chunk.map((item, offset) => ({ Id: String(offset), MessageBody: this.#bodyOf(item) }));
      const answer = await this.#client.sendMessageBatch({ QueueUrl: url, Entries: entries });

      if (answer.Failed && answer.Failed.length > 0) {
        throw new Error(
          `pushMany("${queue.name}") failed to send ${answer.Failed.length} of ${chunk.length} messages: ` +
            answer.Failed.map((failed) => `${failed.Id} (${failed.Message ?? "no reason given"})`).join(", "),
        );
      }

      for (const sent of answer.Successful ?? []) {
        ids[at + Number(sent.Id)] = sent.MessageId;
      }
    }

    return ids;
  }

  /**
   * Publishes an already-encoded payload directly to `address`, a queue url {@link addressOf}
   * resolved earlier.
   *
   * `idempotencyKey` is not honoured: see this class's own doc for what that costs under a race
   * between two replicas promoting the same delayed job.
   */
  async publishEncoded(address: string, payload: Uint8Array, _idempotencyKey: string): Future<string> {
    const answer = await this.#client.sendMessage({
      QueueUrl: address,
      MessageBody: new TextDecoder().decode(payload),
    });
    return answer.MessageId ?? crypto.randomUUID();
  }

  async size(queue: RegisteredQueue): Future<number> {
    const url = await this.#ensureQueue(queue);
    return await this.#approximateCount(url);
  }

  async deadCount(queue: RegisteredQueue): Future<number> {
    const { url } = await this.#ensureDeadLetter(queue);
    return await this.#approximateCount(url);
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

  /** Starts one drain loop per registered queue. Does nothing when already draining. */
  startDraining(): void {
    if (!this.#stopped) return;
    this.#stopped = false;

    for (const queue of queueRegistry.list()) {
      void this.drain(queue);
    }
  }

  stopDraining(): void {
    this.#stopped = true;
  }

  /**
   * Starts `queue`'s own drain loop, whether or not it is registered.
   *
   * @remarks
   * `startDraining` is what a host calls, once, for every declared queue at once. This is what it
   * calls per queue, and it is public so a test can drive one queue's own loop directly instead of
   * going through the shared registry every other declared queue in the same process also sits in,
   * the same way `runner.test.ts` feeds `MessageDispatcher.dispatch` a batch directly rather than
   * starting `queueRunner`.
   *
   * It clears `#stopped` itself rather than relying on `startDraining` to have done it, so a
   * caller that reaches this directly still gets a loop that actually turns.
   */
  async drain(queue: RegisteredQueue): Future<void> {
    this.#stopped = false;
    const url = await this.#ensureQueue(queue);

    while (!this.#stopped) {
      let messages: SqsMessage[];
      try {
        messages = await this.#receive(queue, url);
      } catch (error) {
        log.error("queue.sqs_receive_failed", { metadata: { queue: queue.name, error } });
        await new Promise((resolve) => setTimeout(resolve, RECEIVE_RETRY_DELAY.inMilliseconds));
        continue;
      }
      if (messages.length === 0) continue;

      await this.processReceived(queue, url, messages);
    }
  }

  /**
   * Processes `messages`, received from `queue`'s own queue at `url`, the way one turn of
   * {@link drain}'s own loop does.
   *
   * @remarks
   * Split out so a test can feed a batch straight in, without a fake `receiveMessage` and a
   * polling loop to wait on: {@link drain} is what calls this in production.
   */
  async processReceived(queue: RegisteredQueue, url: string, messages: readonly SqsMessage[]): Future<void> {
    if (queue.mode === "batch") await this.#processBatch(queue, url, messages);
    else await runPooled(messages, queue.concurrency, (message) => this.#processOne(queue, url, message));
  }

  #bodyOf<T>(data: T): string {
    return new TextDecoder().decode(encode({ data }));
  }

  async #approximateCount(url: string): Future<number> {
    try {
      const attributes = await this.#client.getQueueAttributes({
        QueueUrl: url,
        AttributeNames: ["ApproximateNumberOfMessages"],
      });
      return Number(attributes.Attributes?.ApproximateNumberOfMessages ?? "0");
    } catch (error) {
      log.error("queue.count_failed", { metadata: { url, consequence: "the count is reported as 0", error } });
      return 0;
    }
  }

  async #ensureQueue(queue: RegisteredQueue): Future<string> {
    const cached = this.#urls.get(queue.name);
    if (cached) return cached;

    const { arn } = await this.#ensureDeadLetter(queue);
    const created = await this.#client.createQueue({
      QueueName: sqsName(queue.name),
      Attributes: {
        VisibilityTimeout: String(this.#visibilitySeconds(queue)),
        ReceiveMessageWaitTimeSeconds: String(LONG_POLL_SECONDS),
        RedrivePolicy: JSON.stringify({ deadLetterTargetArn: arn, maxReceiveCount: String(queue.maxRetries + 1) }),
      },
    });
    if (!created.QueueUrl) throw new Error(`SQS did not answer a url for queue "${queue.name}".`);

    this.#urls.set(queue.name, created.QueueUrl);
    return created.QueueUrl;
  }

  async #ensureDeadLetter(queue: RegisteredQueue): Future<{ url: string; arn: string }> {
    const cachedUrl = this.#deadUrls.get(queue.name);
    const cachedArn = this.#deadArns.get(queue.name);
    if (cachedUrl && cachedArn) return { url: cachedUrl, arn: cachedArn };

    const created = await this.#client.createQueue({ QueueName: sqsName(queue.name, "-dead") });
    if (!created.QueueUrl) throw new Error(`SQS did not answer a url for the dead letter of queue "${queue.name}".`);

    const attributes = await this.#client.getQueueAttributes({
      QueueUrl: created.QueueUrl,
      AttributeNames: ["QueueArn"],
    });
    const arn = attributes.Attributes?.QueueArn;
    if (!arn) throw new Error(`SQS did not answer an arn for the dead letter of queue "${queue.name}".`);

    this.#deadUrls.set(queue.name, created.QueueUrl);
    this.#deadArns.set(queue.name, arn);
    return { url: created.QueueUrl, arn };
  }

  #visibilitySeconds(queue: RegisteredQueue): number {
    return Math.max(0, Math.min(43_200, Math.ceil(queue.processingTimeoutMs / 1000)));
  }

  #backoffFor(queue: RegisteredQueue): ExponentialBackoff {
    return new ExponentialBackoff(
      Duration.milliseconds(queue.retryBackoffMs),
      Duration.milliseconds(queue.retryBackoffMaxMs),
    );
  }

  /**
   * Pulls one poll's worth of messages, and for a batch queue keeps pulling without waiting once
   * the first has landed, up to `queue.lingerMs` or ten messages, mirroring `linger_fetch.ts`'s
   * own early stop so a lone message does not sit for the whole window.
   */
  async #receive(queue: RegisteredQueue, url: string): Future<SqsMessage[]> {
    const first = await this.#client.receiveMessage({
      QueueUrl: url,
      MaxNumberOfMessages: MAX_RECEIVE,
      WaitTimeSeconds: LONG_POLL_SECONDS,
    });
    const messages = first.Messages ?? [];
    if (messages.length === 0 || queue.mode !== "batch") return messages;

    const collected = [...messages];
    const deadline = Date.now() + (queue.lingerMs ?? 0);
    while (collected.length < MAX_RECEIVE && Date.now() < deadline) {
      const more = await this.#client.receiveMessage({
        QueueUrl: url,
        MaxNumberOfMessages: MAX_RECEIVE,
        WaitTimeSeconds: 0,
      });
      if (!more.Messages || more.Messages.length === 0) break;
      collected.push(...more.Messages);
    }
    return collected;
  }

  async #processOne(queue: RegisteredQueue, url: string, message: SqsMessage): Future<void> {
    const wire = message.Body ? safeDecode<unknown>(new TextEncoder().encode(message.Body)) : null;
    if (wire === null) return await this.#discard(queue, url, message);

    const attempts = Number(message.Attributes?.ApproximateReceiveCount ?? "1");
    const envelope: QueueMessage<unknown> = { id: message.MessageId ?? "", data: wire.data, attempts };

    try {
      await withDeadline(
        `queue:${queue.name}`,
        Duration.milliseconds(queue.processingTimeoutMs),
        (queue.handler as JobHandler<unknown>)(envelope.data, envelope),
      );
      await this.#ack(queue, url, message);
    } catch (error) {
      log.error("queue.handler_failed", { metadata: { queue: queue.name, messages: 1, error } });
      await this.#fail(queue, url, message, attempts);
    }
  }

  async #processBatch(queue: RegisteredQueue, url: string, messages: readonly SqsMessage[]): Future<void> {
    const readable: Readable[] = [];
    for (const message of messages) {
      const wire = message.Body ? safeDecode<unknown>(new TextEncoder().encode(message.Body)) : null;
      if (wire === null) {
        await this.#discard(queue, url, message);
        continue;
      }
      readable.push({ message, wire, attempts: Number(message.Attributes?.ApproximateReceiveCount ?? "1") });
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
      await runPooled(readable, queue.concurrency, (one) => this.#fail(queue, url, one.message, one.attempts));
      return;
    }

    await runPooled(readable, queue.concurrency, (one) => this.#ack(queue, url, one.message));
  }

  async #ack(queue: RegisteredQueue, url: string, message: SqsMessage): Future<void> {
    if (!message.ReceiptHandle) return;
    try {
      await this.#client.deleteMessage({ QueueUrl: url, ReceiptHandle: message.ReceiptHandle });
    } catch (error) {
      log.error("queue.ack_failed", { metadata: { queue: queue.name, error } });
    }
  }

  /** Sends a message nothing can read straight to the dead letter, the bytes forwarded as they arrived. */
  async #discard(queue: RegisteredQueue, url: string, message: SqsMessage): Future<void> {
    log.error("queue.payload_unreadable", {
      metadata: { queue: queue.name, consequence: "the message goes straight to the dead letter" },
    });

    try {
      const { url: deadUrl } = await this.#ensureDeadLetter(queue);
      await this.#client.sendMessage({ QueueUrl: deadUrl, MessageBody: message.Body ?? "" });
      await this.#ack(queue, url, message);
    } catch (error) {
      log.error("queue.discard_failed", { metadata: { queue: queue.name, error } });
      await this.#retry(queue, url, message, this.#visibilitySeconds(queue));
    }
  }

  /** Answers for a message whose body refused: another attempt, or the dead letter. */
  async #fail(queue: RegisteredQueue, url: string, message: SqsMessage, attempts: number): Future<void> {
    if (attempts >= queue.maxRetries) {
      try {
        const { url: deadUrl } = await this.#ensureDeadLetter(queue);
        await this.#client.sendMessage({ QueueUrl: deadUrl, MessageBody: message.Body ?? "" });
        await this.#ack(queue, url, message);
      } catch (error) {
        log.error("queue.dead_letter_failed", { metadata: { queue: queue.name, error } });
        await this.#retry(queue, url, message, this.#backoffSeconds(queue, attempts));
      }
      return;
    }

    await this.#retry(queue, url, message, this.#backoffSeconds(queue, attempts));
  }

  async #retry(queue: RegisteredQueue, url: string, message: SqsMessage, visibilitySeconds: number): Future<void> {
    if (!message.ReceiptHandle) return;
    try {
      await this.#client.changeMessageVisibility({
        QueueUrl: url,
        ReceiptHandle: message.ReceiptHandle,
        VisibilityTimeout: visibilitySeconds,
      });
    } catch (error) {
      log.error("queue.retry_failed", { metadata: { queue: queue.name, error } });
    }
  }

  #backoffSeconds(queue: RegisteredQueue, attempts: number): number {
    const delayMs = this.#backoffFor(queue).delayFor(attempts).inMilliseconds;
    return Math.max(0, Math.min(43_200, Math.round(delayMs / 1000)));
  }
}
