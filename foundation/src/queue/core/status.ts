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

import { delayedCounts } from "./delayed/counts.ts";
import type { QueueMode, RegisteredQueue } from "./declaration.ts";
import { DEAD_STREAM, streamOf } from "./naming.ts";
import { queueRegistry } from "./registry.ts";
import { topology } from "./topology/topology.ts";

export interface QueueStatus {
  readonly name: string;
  readonly mode: QueueMode;
  readonly dedicated: boolean;
  readonly pending: number;
  readonly dead: number;
  readonly delayed: number;
}

class QueueStatusReader {
  async all(): Promise<QueueStatus[]> {
    const delayed = await this.#delayed();

    return await Promise.all(
      queueRegistry
        .list()
        .map((queue) => this.#read(queue, delayed[queue.name] ?? 0)),
    );
  }

  async one(queue: RegisteredQueue): Promise<QueueStatus> {
    const delayed = await this.#delayed();

    return await this.#read(queue, delayed[queue.name] ?? 0);
  }

  async #read(queue: RegisteredQueue, delayed: number): Promise<QueueStatus> {
    const [pending, dead] = await Promise.all([
      topology.countBySubject(streamOf(queue.dedicated), queue.subject),
      topology.countBySubject(DEAD_STREAM, queue.deadSubject),
    ]);

    return {
      name: queue.name,
      mode: queue.mode,
      dedicated: queue.dedicated,
      pending,
      dead,
      delayed,
    };
  }

  async #delayed(): Promise<Record<string, number>> {
    const counts = await delayedCounts();
    if (counts.truncated) {
      console.warn(
        "[queue] delayed backlog exceeds the scan cap, per-queue counts are a lower bound",
      );
    }

    return counts.counts;
  }
}

export const queueStatus: QueueStatusReader = new QueueStatusReader();
