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

import type { Future } from "@scribe/alchemy";
import { log } from "@scribe/alchemy/observe";
import { Duration } from "@scribe/alchemy";
import { delayedCounts } from "./delayed/delayed_counts.ts";
import type { QueueMode, RegisteredQueue } from "./queue_declaration.ts";
import { DEAD_STREAM, streamOf } from "./queue_naming.ts";
import { queueRegistry } from "./queue_registry.ts";
import { topology } from "./topology/topology.ts";

/** What a queue is holding right now, across the three places a job can be waiting. */
export interface QueueStatus {
  /** The name the declaration gave. */
  readonly name: string;

  /** Whether the handler is called per message or per group. */
  readonly mode: QueueMode;

  /** Whether this queue has a stream of its own rather than sharing the common one. */
  readonly dedicated: boolean;

  /** Messages sitting on the subject, waiting to be handed to the handler. */
  readonly pending: number;

  /** Messages that used up their deliveries and are parked on the dead letter subject. */
  readonly dead: number;

  /**
   * Explicitly delayed jobs waiting in Redis for their due date.
   *
   * A lower bound rather than a count when the scan hits its cap or Redis does not answer,
   * which the reader warns about on the log.
   */
  readonly delayed: number;
}

class QueueStatusReader {
  async all(): Future<QueueStatus[]> {
    const delayed = await this.#delayed();

    return await Promise.all(
      queueRegistry
        .list()
        .map((queue) => this.#read(queue, delayed[queue.name] ?? 0)),
    );
  }

  async one(queue: RegisteredQueue): Future<QueueStatus> {
    const delayed = await this.#delayed();

    return await this.#read(queue, delayed[queue.name] ?? 0);
  }

  /**
   * Drops the reading of the delayed set this reader is holding.
   *
   * @remarks
   * The next standing asked for walks the set again. It exists for a caller that has just parked
   * or promoted something and wants the number that follows rather than the one before.
   */
  forget(): void {
    _lastCounts = null;
  }

  async #read(queue: RegisteredQueue, delayed: number): Future<QueueStatus> {
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

  /**
   * How many jobs are parked for each queue, read at most once per {@link COUNTS_HELD_FOR}.
   *
   * @remarks
   * The delayed set is shared by every queue of the process, so counting one queue means walking
   * all of it: at the scan cap that is a hundred round trips. A dashboard asking each queue for
   * its standing in turn used to pay that walk once per queue, for a number `all` reads once.
   *
   * What is answered is a standing somebody is looking at, not a number anything decides on, so
   * a second-old count is the same answer. The scan itself is what would make it expensive to
   * be exact.
   */
  async #delayed(): Future<Record<string, number>> {
    const held = _lastCounts;
    if (held !== null && Date.now() - held.readAt < COUNTS_HELD_FOR.inMilliseconds) {
      return held.counts;
    }

    const counts = await delayedCounts();
    if (counts.truncated) {
      log.warn("queue.delayed_counts_truncated", {
        metadata: { reason: "the delayed backlog exceeds the scan cap", counts: "a lower bound" },
      });
    }

    _lastCounts = { counts: counts.counts, readAt: Date.now() };
    return counts.counts;
  }
}

/** How long a reading of the delayed set stands before it is walked again. */
const COUNTS_HELD_FOR: Duration = Duration.seconds(1);

/** The last reading of the delayed set, and when it was taken. */
let _lastCounts: { counts: Record<string, number>; readAt: number } | null = null;

/** Reads the standing of one queue or of all of them. */
export const queueStatus: QueueStatusReader = new QueueStatusReader();
