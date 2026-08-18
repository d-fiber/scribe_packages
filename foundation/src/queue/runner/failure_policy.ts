// Copyright (C) 2026 Fiber
//
// This file is part of scribe and is made available under the PolyForm Shield
// License 1.0.0. The full terms are in the LICENSE file at the root of this
// repository, and at https://polyformproject.org/licenses/shield/1.0.0
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
//
// The one thing you may not do:
// - Use it to provide any product that competes with scribe, or with any
//   product Fiber or its affiliates provide using scribe. Products compete
//   even when they are offered free of charge, through a different kind of
//   interface, or for a different technical platform.
//
// If you pass this software on:
// - Anyone who receives any part of it from you must also receive these terms,
//   or the URL above, together with the "Required Notice" line carried by the
//   LICENSE file.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE COMES AS IS, WITHOUT ANY WARRANTY OR
// CONDITION, AND THE LICENSOR WILL NOT BE LIABLE TO YOU FOR ANY DAMAGES ARISING
// OUT OF THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY KIND OF
// LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

import { ExponentialBackoff } from "@scribe/core/runtime/support/async/backoff.ts";
import type { RegisteredQueue } from "@scribe/foundation/src/queue/core/declaration.ts";
import { encode, type WireMessage } from "@scribe/foundation/src/queue/core/wire.ts";
import { topology } from "@scribe/foundation/src/queue/core/topology/topology.ts";
import type { JsMsg } from "@nats-io/jetstream";
import type { JobOutcome } from "./drain_tally.ts";

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
      queue.retryBackoffMs,
      queue.retryBackoffMaxMs,
    );
  }

  /**
   * Sends a failed message back for another attempt, or to the dead letter.
   *
   * The attempt count is read from the server's `deliveryCount`, which is one on a first
   * delivery and therefore counts attempts directly.
   *
   * @param message - The message being given up on for now.
   * @param wire - Its decoded payload, needed only on the dead-letter path.
   */
  async apply(
    message: JsMsg,
    wire: WireMessage<unknown>,
  ): Promise<Exclude<JobOutcome, "done">> {
    const attempts = message.info.deliveryCount;

    if (attempts >= this.#queue.maxRetries) {
      await topology.publish(this.#queue.deadSubject, encode({ data: wire.data }));
      message.term();
      return "dead";
    }

    message.nak(this.#backoff.delayFor(attempts));
    return "retried";
  }
}
