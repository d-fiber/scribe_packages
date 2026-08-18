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

import type { PushOptions } from "@scribe/foundation/contracts/queue/queue.ts";
import type { RegisteredQueue } from "./declaration.ts";
import { delayedCounts } from "./delayed/counts.ts";
import { pushDelayed } from "./delayed/schedule.ts";
import { DEAD_STREAM, streamOf } from "./naming.ts";
import { type QueueStatus, queueStatus } from "./status.ts";
import { ensureTopology } from "./topology/ready.ts";
import { topology } from "./topology/topology.ts";
import { encode } from "./wire.ts";

/**
 * The producer side of a queue: what {@link defineQueue} answers to its declarer.
 *
 * Draining is deliberately absent. A pass over a queue belongs to the runner, and `core/`
 * is not allowed to reach into `runner/`.
 */
export interface Queue<TJob> {
  readonly name: string;
  push(data: TJob, opts?: PushOptions): Promise<string>;
  pushMany(items: readonly TJob[]): Promise<string[]>;
  size(): Promise<number>;
  deadCount(): Promise<number>;
  delayedCount(): Promise<number>;
  status(): Promise<QueueStatus>;
}

/** The only implementation of {@link Queue}. */
export class QueueProducer<TJob> implements Queue<TJob> {
  readonly #queue: RegisteredQueue;

  constructor(queue: RegisteredQueue) {
    this.#queue = queue;
  }

  get name(): string {
    return this.#queue.name;
  }

  async push(data: TJob, opts: PushOptions = {}): Promise<string> {
    if (opts.delay && opts.delay.ms > 0) {
      return await pushDelayed(
        this.#queue.name,
        this.#queue.subject,
        data,
        opts.delay.ms,
      );
    }

    await ensureTopology();
    return await this.#publish(data);
  }

  async pushMany(items: readonly TJob[]): Promise<string[]> {
    if (items.length === 0) return [];

    await ensureTopology();
    return await Promise.all(items.map((data) => this.#publish(data)));
  }

  async size(): Promise<number> {
    await ensureTopology();
    return await topology.countBySubject(
      streamOf(this.#queue.dedicated),
      this.#queue.subject,
    );
  }

  async deadCount(): Promise<number> {
    await ensureTopology();
    return await topology.countBySubject(DEAD_STREAM, this.#queue.deadSubject);
  }

  async delayedCount(): Promise<number> {
    const delayed = await delayedCounts();
    return delayed.counts[this.#queue.name] ?? 0;
  }

  async status(): Promise<QueueStatus> {
    await ensureTopology();
    return await queueStatus.one(this.#queue);
  }

  #publish(data: TJob): Promise<string> {
    return topology.publish(this.#queue.subject, encode({ data }));
  }
}
