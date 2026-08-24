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

import { ExponentialBackoff, type Future } from "@scribe/alchemy";
import type { RegisteredQueue } from "@scribe/foundation/lib/src/queue/queue_declaration.ts";
import { encode, type WireMessage } from "@scribe/foundation/lib/src/queue/wire_message.ts";
import { forgetHandBacks, handBacksFor } from "./hand_backs.ts";
import { topology } from "@scribe/foundation/lib/src/queue/topology/topology.ts";
import type { JsMsg } from "@nats-io/jetstream";
import type { JobOutcome } from "./drain_tally.ts";
import { Duration } from "@scribe/alchemy";

/**
 * What becomes of a message whose handler threw.
 *
 * Retrying is the server's own mechanism: the message is negatively acknowledged with the
 * delay it should come back after, and JetStream holds it in the meantime. Nothing about a
 * failing job is written anywhere else, which is what makes a retry cost one local call
 * rather than a term, two Redis commands, a re-encode and a republish.
 *
 * The attempt count is read from the message rather than carried in it. The server counts
 * deliveries, so the number cannot drift from what actually happened, and a payload that
 * loses a round trip no longer loses its history with it.
 */
export class FailurePolicy {
  readonly #queue: RegisteredQueue;
  readonly #backoff: ExponentialBackoff;

  constructor(queue: RegisteredQueue) {
    this.#queue = queue;
    this.#backoff = new ExponentialBackoff(
      Duration.milliseconds(queue.retryBackoffMs),
      Duration.milliseconds(queue.retryBackoffMaxMs),
    );
  }

  /**
   * Sends a failed message back for another attempt, or to the dead letter.
   *
   * The attempt count is read from the server's `deliveryCount`, which is one on a first
   * delivery. Deliveries handed back by a replica that does not declare the subject are taken
   * off it, and only where it decides something: a message this queue would otherwise give up on.
   * Every other failure costs nothing to find that out.
   *
   * @param message - The message being given up on for now.
   * @param wire - Its decoded payload, needed only on the dead-letter path.
   */
  async apply(
    message: JsMsg,
    wire: WireMessage<unknown>,
  ): Future<Exclude<JobOutcome, "done">> {
    const attempts = message.info.deliveryCount;

    if (attempts >= this.#queue.maxRetries) {
      const handedBack = await handBacksFor(message);

      if (attempts - handedBack < this.#queue.maxRetries) {
        message.nak(this.#backoff.delayFor(attempts - handedBack).inMilliseconds);
        return "retried";
      }

      await topology.publish(this.#queue.deadSubject, encode({ data: wire.data }));
      message.term();
      await forgetHandBacks(message);
      return "dead";
    }

    message.nak(this.#backoff.delayFor(attempts).inMilliseconds);
    return "retried";
  }
}
