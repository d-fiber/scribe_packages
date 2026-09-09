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

import type { RegisteredQueue } from "../queue_declaration.ts";
import type { WireMessage } from "../wire_message.ts";
import { topology } from "../topology/topology.ts";
import { type Future, type UnmodifiableList, withDeadline } from "@scribe/alchemy";
import { log } from "@scribe/alchemy/observe";
import type { JsMsg } from "@nats-io/jetstream";
import type { DrainTally } from "./drain_tally.ts";
import { FailurePolicy } from "./failure_policy.ts";
import { Duration } from "@scribe/alchemy";

/**
 * Runs a group of messages that all belong to the same queue.
 *
 * @remarks
 * A seam of its own so `MessageDispatcher` can hand a group to whichever processing mode the
 * queue declared, {@link JobProcessor} or {@link BatchProcessor}, without knowing which one it
 * is talking to.
 */
export interface MessageProcessor {
  /**
   * Hands `messages` to the queue's body and records each outcome on `tally`.
   *
   * Every message is answered for, whether by an acknowledgement, a retry or the dead letter.
   * One left unanswered would sit until the server's own deadline redelivered it.
   */
  process(messages: UnmodifiableList<JsMsg>, tally: DrainTally): Future<void>;
}

/**
 * What both processing modes share: the deadline, the failure path and the reporting.
 *
 * The two subclasses differ only in how they call the body and when they acknowledge, which
 * is the whole reason the split exists.
 */
export abstract class BaseProcessor implements MessageProcessor {
  /** The queue this processor was built for, and the one a subclass drains against. */
  protected readonly queue: RegisteredQueue;
  readonly #failures: FailurePolicy;

  constructor(queue: RegisteredQueue) {
    this.queue = queue;
    this.#failures = new FailurePolicy(queue);
  }

  /** The {@link MessageProcessor.process} contract, left to each subclass's own processing mode. */
  abstract process(
    messages: UnmodifiableList<JsMsg>,
    tally: DrainTally,
  ): Future<void>;

  /** Logs that this queue's handler raised while processing `messages` messages, so a raised body error is not silently swallowed by the failure policy that follows. */
  protected reportFailure(error: unknown, messages: number): void {
    log.error("queue.handler_failed", {
      metadata: { queue: this.queue.name, messages, error },
    });
  }

  /**
   * Runs `call` against this queue's own processing deadline.
   *
   * @remarks
   * A handler that hangs would otherwise hold its messages unanswered for as long as the server's
   * own ack deadline allows, so both subclasses wrap the body's call in this rather than trusting
   * every handler to bound its own work.
   */
  protected guarded<R>(call: Future<R>): Future<R> {
    return withDeadline(
      `queue:${this.queue.name}`,
      Duration.milliseconds(this.queue.processingTimeoutMs),
      call,
    );
  }

  /**
   * Answers for a message whose body refused, whatever the policy decides.
   *
   * @remarks
   * The dead-letter branch publishes, so it can fail on its own. Left to raise, that failure
   * escapes the pool and leaves every message the pool had not reached yet unanswered until the
   * server gives up on them. A refusal that comes back later loses nothing, so it is the answer
   * of last resort.
   *
   * The decoded message is passed in rather than read again: whoever called this already has it,
   * and decoding twice is both a waste and a second place the same payload could refuse.
   */
  protected async fail(
    message: JsMsg,
    tally: DrainTally,
    wire: WireMessage<unknown>,
  ): Future<void> {
    try {
      tally.record(await this.#failures.apply(message, wire));
    } catch (error) {
      log.error("queue.failure_policy_failed", {
        metadata: {
          queue: this.queue.name,
          consequence: "the message is refused and comes back",
          error,
        },
      });
      message.nak(this.queue.retryBackoffMs);
      tally.record("retried");
    }
  }

  /**
   * Sends a message nothing can read straight to the dead letter.
   *
   * @remarks
   * A payload that does not parse will not parse on the next delivery either, so handing it back
   * spends every attempt the queue allows and ends on the server giving up, which reports nothing
   * anybody reads. The dead letter is where somebody looks.
   *
   * The bytes are forwarded as they arrived rather than re-encoded: what could not be parsed
   * cannot be rebuilt, and whoever reads the dead letter needs what actually travelled.
   */
  protected async discard(message: JsMsg, tally: DrainTally): Future<void> {
    log.error("queue.payload_unreadable", {
      metadata: {
        queue: this.queue.name,
        seq: message.seq,
        consequence: "the message goes straight to the dead letter",
      },
    });

    try {
      await topology.publish(this.queue.deadSubject, message.data);
      message.term();
      tally.record("dead");
    } catch (error) {
      log.error("queue.discard_failed", { metadata: { queue: this.queue.name, error } });
      message.nak(this.queue.retryBackoffMs);
      tally.record("retried");
    }
  }
}
