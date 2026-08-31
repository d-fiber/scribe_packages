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

import type { BatchHandler } from "../queue_options.ts";
import { safeDecode, type WireMessage } from "../wire_message.ts";
import { type Future, runPooled, type UnmodifiableList } from "@scribe/alchemy";
import type { JsMsg } from "@nats-io/jetstream";
import type { DrainTally } from "./drain_tally.ts";
import { log } from "@scribe/alchemy/observe";
import { BaseProcessor } from "./base_processor.ts";

/**
 * Calls the body once with the whole group, and acknowledges it whole.
 *
 * On failure each message goes through the policy **individually**, so every one keeps its
 * own delivery count, but one poisonous message makes the whole group run again.
 */
export class BatchProcessor extends BaseProcessor {
  /** The {@link BaseProcessor.process} override: calls the body once with the whole group, decoded and acked together. */
  override async process(
    messages: UnmodifiableList<JsMsg>,
    tally: DrainTally,
  ): Future<void> {
    const readable: JsMsg[] = [];
    const wires: WireMessage<unknown>[] = [];

    for (const message of messages) {
      const wire = safeDecode<unknown>(message.data);
      if (wire === null) await this.discard(message, tally);
      else {
        readable.push(message);
        wires.push(wire);
      }
    }
    if (readable.length === 0) return;

    const payloads = wires.map((wire) => wire.data);

    try {
      await this.guarded(
        (this.queue.handler as BatchHandler<unknown>)(payloads),
      );
    } catch (error) {
      this.reportFailure(error, readable.length);
      await runPooled(
        readable.map((message, at) => ({ message, wire: wires[at] })),
        this.queue.concurrency,
        ({ message, wire }) => this.fail(message, tally, wire),
      );
      return;
    }

    await this.#acknowledge(readable, wires, tally);
  }

  /**
   * Acknowledges a group whose body agreed, one member at a time.
   *
   * @remarks
   * It runs outside the try the body is called in. Acknowledging inside it made an
   * acknowledgement that refuses read as a body that refused, so the whole group went down the
   * failure path: the members already acknowledged were handed back or written to the dead
   * letter on top of their acknowledgement, and a job that had succeeded was filed as a failure
   * for whoever reads the dead letter to run a second time.
   *
   * A member whose acknowledgement refuses is left for the server to hand over again. The body
   * agreed, so there is nothing to retry and nothing to file, and a body that is idempotent is
   * what makes a second delivery safe. On its last delivery there is no second one to wait for,
   * so it goes to the dead letter instead of disappearing when the server gives up on it.
   */
  async #acknowledge(
    readable: UnmodifiableList<JsMsg>,
    wires: UnmodifiableList<WireMessage<unknown>>,
    tally: DrainTally,
  ): Future<void> {
    let answered = 0;

    for (let at = 0; at < readable.length; at++) {
      const message = readable[at];
      const spent = message.info.deliveryCount >= this.queue.maxRetries;

      try {
        message.ack();
        answered++;
      } catch (error) {
        log.error("queue.ack_failed", {
          metadata: {
            queue: this.queue.name,
            seq: message.seq,
            consequence: spent
              ? "the message is on its last delivery, so it is written to the dead letter"
              : "the body agreed, so the message is left for the server to hand over again",
            error,
          },
        });
        if (spent) await this.fail(message, tally, wires[at]);
      }
    }

    if (answered > 0) tally.record("done", answered);
  }
}
