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

import {
  DEDICATED_STREAM,
  sanitize,
  SHARED_CONSUMER,
  SHARED_STREAM,
} from "@scribe/foundation/src/queue/core/naming.ts";
import { topology } from "@scribe/foundation/src/queue/core/topology/topology.ts";
import type { RegisteredQueue } from "@scribe/foundation/src/queue/core/declaration.ts";
import type { JsMsg } from "@nats-io/jetstream";
import { graceFor } from "../grace.ts";

const FETCH_EXPIRES_MS = 5_000;

/**
 * Where one loop reads from: the shared consumer, or a queue's own.
 *
 * Only the shared source promotes the delayed set, because promoting is a process-wide job
 * and every dedicated loop doing it too would multiply the Redis traffic by the number of
 * isolated queues.
 */
export class StreamSource {
  readonly label: string;
  readonly promotesDelayed: boolean;

  readonly #stream: string;
  readonly #durable: string;

  constructor(
    label: string,
    stream: string,
    durable: string,
    promotesDelayed: boolean,
  ) {
    this.label = label;
    this.#stream = stream;
    this.#durable = durable;
    this.promotesDelayed = promotesDelayed;
  }

  static shared(): StreamSource {
    return new StreamSource("shared", SHARED_STREAM, SHARED_CONSUMER, true);
  }

  static dedicated(queue: RegisteredQueue): StreamSource {
    return new StreamSource(
      queue.name,
      DEDICATED_STREAM,
      sanitize(queue.name),
      false,
    );
  }

  static forQueue(queue: RegisteredQueue): StreamSource {
    return queue.dedicated ? StreamSource.dedicated(queue) : StreamSource.shared();
  }

  fetch(count: number): Promise<JsMsg[]> {
    return topology.fetch(
      this.#stream,
      this.#durable,
      count,
      FETCH_EXPIRES_MS,
      graceFor,
    );
  }
}
