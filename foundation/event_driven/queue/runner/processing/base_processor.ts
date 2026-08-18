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

import type { RegisteredQueue } from "@scribe/host/packages/foundation/event_driven/queue/core/declaration.ts";
import { decode } from "@scribe/host/packages/foundation/event_driven/queue/core/wire.ts";
import { withDeadline } from "@scribe/core/runtime/support/async/deadline.ts";
import type { JsMsg } from "@nats-io/jetstream";
import type { DrainTally } from "../drain_tally.ts";
import { FailurePolicy } from "../failure_policy.ts";

export interface MessageProcessor {
  process(messages: readonly JsMsg[], tally: DrainTally): Promise<void>;
}

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
      this.queue.processingTimeoutMs,
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
