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

import type { RegisteredQueue } from "@scribe/foundation/lib/src/queue/core/declaration.ts";
import { decode } from "@scribe/foundation/lib/src/queue/core/wire.ts";
import { withDeadline } from "@scribe/alchemy";
import type { JsMsg } from "@nats-io/jetstream";
import type { DrainTally } from "../drain_tally.ts";
import { FailurePolicy } from "../failure_policy.ts";
import { Duration } from "@scribe/alchemy";

/** Runs a group of messages that all belong to the same queue. */
export interface MessageProcessor {
  /**
   * Hands `messages` to the queue's body and records each outcome on `tally`.
   *
   * Every message is answered for, whether by an acknowledgement, a retry or the dead letter.
   * One left unanswered would sit until the server's own deadline redelivered it.
   */
  process(messages: readonly JsMsg[], tally: DrainTally): Promise<void>;
}

/**
 * What both processing modes share: the deadline, the failure path and the reporting.
 *
 * The two subclasses differ only in how they call the body and when they acknowledge, which
 * is the whole reason the split exists.
 */
export abstract class BaseProcessor implements MessageProcessor {
  protected readonly queue: RegisteredQueue;
  readonly #failures: FailurePolicy;

  constructor(queue: RegisteredQueue) {
    this.queue = queue;
    this.#failures = new FailurePolicy(queue);
  }

  abstract process(
    messages: readonly JsMsg[],
    tally: DrainTally,
  ): Promise<void>;

  protected reportFailure(error: unknown, messages: number): void {
    console.error(
      `[queue:${this.queue.name}] handler failed on ${messages} message(s):`,
      error,
    );
  }

  protected guarded<R>(call: Promise<R>): Promise<R> {
    return withDeadline(
      `queue:${this.queue.name}`,
      Duration.milliseconds(this.queue.processingTimeoutMs),
      call,
    );
  }

  protected async fail(message: JsMsg, tally: DrainTally): Promise<void> {
    const outcome = await this.#failures.apply(
      message,
      decode<unknown>(message.data),
    );
    tally.record(outcome);
  }
}
