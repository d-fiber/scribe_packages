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

import { Duration, Future, type UnmodifiableList } from "@scribe/alchemy";
import { Queue } from "../lib/src/queue/queue.ts";
import type { QueueMessage } from "../lib/src/queue/queue_options.ts";

/** What one welcome mail needs to be sent, carried whole because a handler reads no request. */
interface EmailJob {
  /** The mailbox to send to. */
  readonly to: string;

  /** The template the mail is rendered from. */
  readonly template: string;
}

/** One page view, as a batch handler receives it. */
interface PageView {
  /** The path that was served. */
  readonly path: string;

  /** When it was served, in milliseconds since the epoch. */
  readonly at: number;
}

/**
 * Declaring a queue and holding its producer are the same call.
 *
 * The body stays with the declaration so a reader of the name can find what it does. Delivery
 * is at-least-once, so the body has to tolerate seeing the same message twice: a replica that
 * dies between handling and acknowledging gets it again.
 */
export const emails = new Queue<EmailJob>(
  {
    name: "emails",
    options: { maxRetries: 5, retryBackoff: Duration.seconds(30) },
  },
  async (job: EmailJob, message: QueueMessage<EmailJob>) => {
    if (message.attempts > 1) return;
    await send(job.to, job.template);
  },
);

/**
 * A queue whose body is called once with a group.
 *
 * `batch` is what puts it in that mode, and `lingerMs` is how long a partial group waits for
 * company. The group succeeds or fails whole, and a failed group runs again in full.
 */
export const views = new Queue<PageView>(
  { name: "page-views", batch: { lingerMs: 500 } },
  async (items: UnmodifiableList<PageView>) => {
    await store(items);
  },
);

/** Pushes one job, and answers the identifier the queue assigned it. */
export function welcome(to: string): Future<string> {
  return emails.push({ to, template: "welcome" });
}

/** Pushes a job that only becomes available later. */
export function remind(to: string): Future<string> {
  return emails.push({ to, template: "reminder" }, {
    delay: Duration.hours(24),
  });
}

/**
 * Pushes a group in one call, bounded to sixty-four publications in flight together.
 *
 * @remarks
 * This is still one NATS round trip per recipient, only pipelined: `pushMany` bounds how many
 * publications are in flight at once, not how many are made. A producer on a hot path that wants
 * one round trip for the whole group reaches for {@link welcomeManyAtOnce} instead.
 */
export function welcomeAll(
  recipients: UnmodifiableList<string>,
): Future<string[]> {
  return emails.pushMany(recipients.map((to) => ({ to, template: "welcome" })));
}

/**
 * A queue whose payload is a group, pushed and acknowledged as one message.
 *
 * `batch` groups what several separate publications happen to arrive close together; this
 * groups what the producer already had in hand before it published anything, by carrying an
 * array as the payload of a single message instead of one message per recipient. The trade sits
 * on the consuming side: {@link welcomeBatches} acknowledges the whole array at once, so a
 * handler that throws on one recipient replays every recipient already sent beside it, the same
 * trade `batch` makes for messages that happened to be grouped by the runner instead.
 */
export const welcomeBatches = new Queue<EmailJob[]>(
  {
    name: "welcome-batches",
    options: { maxRetries: 5, retryBackoff: Duration.seconds(30) },
  },
  async (jobs: EmailJob[]) => {
    for (const job of jobs) await send(job.to, job.template);
  },
);

/** Pushes every recipient as one message, which is one NATS round trip for the whole group. */
export function welcomeManyAtOnce(
  recipients: UnmodifiableList<string>,
): Future<string> {
  return welcomeBatches.push(
    recipients.map((to) => ({ to, template: "welcome" })),
  );
}

/** What is waiting, what is due later, and what gave up. */
export async function backlog(): Future<
  { waiting: number; delayed: number; dead: number }
> {
  return {
    waiting: await emails.size(),
    delayed: await emails.delayedCount(),
    dead: await emails.deadCount(),
  };
}

/** Sends one mail, which is what the job the queue drains does. */
function send(_to: string, _template: string): Future<void> {
  return Future.value(undefined);
}

/** Writes a group of views in one round trip. */
function store(_items: UnmodifiableList<PageView>): Future<void> {
  return Future.value(undefined);
}
