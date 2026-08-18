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

import type { JobHandler, QueueMessage } from "@scribe/foundation/contracts/queue/queue.ts";
import { decode } from "@scribe/foundation/src/queue/core/wire.ts";
import { runPooled } from "@scribe/core/runtime/support/async/pool.ts";
import type { JsMsg } from "@nats-io/jetstream";
import type { DrainTally } from "../drain_tally.ts";
import { BaseProcessor } from "./base_processor.ts";

/** Calls the body once per message, with the queue's concurrency, and acks each on its own. */
export class JobProcessor extends BaseProcessor {
  override process(
    messages: readonly JsMsg[],
    tally: DrainTally,
  ): Promise<void> {
    return runPooled(messages, this.queue.concurrency, (message) => this.#processOne(message, tally));
  }

  async #processOne(message: JsMsg, tally: DrainTally): Promise<void> {
    const wire = decode<unknown>(message.data);
    const envelope: QueueMessage<unknown> = {
      id: String(message.seq),
      data: wire.data,
      attempts: message.info.deliveryCount,
    };

    try {
      await this.guarded(
        (this.queue.handler as JobHandler<unknown>)(envelope.data, envelope),
      );
      message.ack();
      tally.record("done");
    } catch (error) {
      this.reportFailure(error, 1);
      await this.fail(message, tally);
    }
  }
}
