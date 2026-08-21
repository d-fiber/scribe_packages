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

import type { Time } from "@scribe/core/contracts/common/time.ts";

/**
 * What a declaration can tune about a queue.
 *
 * Every field is optional, and what is left out is filled from the package defaults. The
 * numbers are shared by every queue on a stream, so what is asked for here is a floor and
 * not a ceiling: the topology takes the most permissive of the declarations.
 */
export interface QueueOptions {
  /** Deliveries after which a job goes to the dead letter. */
  readonly maxRetries?: number;
  /** How many messages one subject holds before the oldest are dropped. */
  readonly maxLen?: number;
  /** How many messages of this queue are handled at once inside a pass. */
  readonly concurrency?: number;
  /** The first retry delay; each further attempt doubles it. */
  readonly retryBackoff?: Time;
  /** The ceiling the doubling stops at. */
  readonly retryBackoffMax?: Time;
  /** How long a handler is given before it is treated as failed. */
  readonly processingTimeout?: Time;
}

/** What a single push can decide for itself. */
export interface PushOptions {
  /** How long the job waits before it becomes available. */
  readonly delay?: Time;
}

/** A message as its handler sees it. */
export interface QueueMessage<T> {
  /** The identifier the queue assigned when this message was enqueued. */
  readonly id: string;

  /** The payload the producer sent, decoded into the handler's own type. */
  readonly data: T;

  /**
   * How many times this message has been delivered, starting at one.
   *
   * It is the server's count, not the payload's, so it cannot drift from what happened.
   */
  readonly attempts: number;
}

/**
 * A body called once per message.
 *
 * It must be idempotent. Delivery is at-least-once, so a replica that dies between handling
 * a message and acknowledging it will see that message again.
 */
export type JobHandler<T> = (
  data: T,
  message: QueueMessage<T>,
) => Promise<void>;

/**
 * A body called once with a group of payloads.
 *
 * The group succeeds or fails whole. On failure each message is retried on its own count,
 * but the group runs again in full.
 */
export type BatchHandler<T> = (items: readonly T[]) => Promise<void>;

/** What one pass over the queues did. */
export interface DrainResult {
  /** Messages whose handler returned, and which were acknowledged. */
  readonly done: number;

  /** Messages whose handler refused and which are coming back for another delivery. */
  readonly retried: number;

  /** Messages that used up their deliveries and were written to the dead letter. */
  readonly dead: number;

  /** Delayed jobs whose due date had passed and that were published by this pass. */
  readonly promoted: number;
}
