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

import { type Future, runPooled, type UnmodifiableList } from "@scribe/alchemy";
import type { RegisteredQueue } from "./queue_declaration.ts";
import type { PushOptions } from "./queue_options.ts";
import type { QueueBackend } from "./queue_backend.ts";
import { delayedCounts } from "./delayed/delayed_counts.ts";
import { pushDelayed } from "./delayed/delayed_schedule.ts";
import { DEAD_STREAM, streamOf } from "./queue_naming.ts";
import { type QueueStatus, queueStatus } from "./queue_status.ts";
import { ensureTopology } from "./topology/ensure_topology.ts";
import { topology } from "./topology/topology.ts";
import { encode } from "./wire_message.ts";
import { queueRunner } from "./runner/queue_runner.ts";

/**
 * How many publications one call to {@link NatsQueueBackend.pushMany} keeps in flight.
 *
 * High enough that a batch is not paced by the round trip time of one publication, low enough
 * that the memory a push costs is decided here and not by the length of the list a caller
 * happened to build.
 */
export const PUBLISH_AT_ONCE = 64;

/**
 * Moves a queue's messages over NATS JetStream, through the shared and dedicated streams
 * `queue.ts`, `runner/` and `topology/` already provision, drain and count.
 *
 * @remarks
 * Every method here is a straight call into code that predates this class: nothing about how a
 * message is published, fetched, retried or dead-lettered changed when this file was written,
 * only where the call is made from. `runner/` and `topology/` stay JetStream-specific end to end,
 * because {@link streamOf}, the shared consumer and the delayed promoter's msgID-based
 * deduplication are all NATS mechanisms with no equivalent this backend has to pretend to offer.
 */
export class NatsQueueBackend implements QueueBackend {
  async push<T>(queue: RegisteredQueue, data: T, opts: PushOptions): Future<string> {
    if (opts.delay && opts.delay.inMilliseconds > 0) {
      return await pushDelayed(queue.name, await this.addressOf(queue), data, opts.delay);
    }

    await ensureTopology();
    return await this.#publish(queue, data);
  }

  /**
   * Publishes every item of `items`, at most {@link PUBLISH_AT_ONCE} of them in flight together.
   *
   * @remarks
   * The pool is what keeps the cost of a push independent of the size of the list. Handing the
   * whole list over at once opened one publication per item, so the producer's memory and the
   * server's inbox both grew with what the caller happened to pass: ten thousand items were ten
   * thousand connections' worth of work asked for in the same tick.
   */
  async pushMany<T>(queue: RegisteredQueue, items: UnmodifiableList<T>): Future<string[]> {
    if (items.length === 0) return [];

    await ensureTopology();
    const ids: string[] = new Array(items.length);
    await runPooled([...items.keys()], PUBLISH_AT_ONCE, async (at) => {
      ids[at] = await this.#publish(queue, items[at]);
    });

    return ids;
  }

  addressOf(queue: RegisteredQueue): Future<string> {
    return Promise.resolve(queue.subject);
  }

  async publishEncoded(address: string, payload: Uint8Array, idempotencyKey: string): Future<string> {
    return await topology.publish(address, payload, idempotencyKey);
  }

  /**
   * How many messages of this queue are waiting to be delivered.
   *
   * @remarks
   * Counted against `queue.dedicated`'s own stream, shared or not, since a dedicated queue's
   * messages never sit on the shared stream at all and counting there would always answer zero.
   */
  async size(queue: RegisteredQueue): Future<number> {
    await ensureTopology();
    return await topology.countBySubject(streamOf(queue.dedicated), queue.subject);
  }

  /** How many messages of this queue have exhausted their delivery attempts and moved to the dead letter, kept there for an operator to inspect or retry. */
  async deadCount(queue: RegisteredQueue): Future<number> {
    await ensureTopology();
    return await topology.countBySubject(DEAD_STREAM, queue.deadSubject);
  }

  /**
   * How many messages of this queue are delayed, waiting for their due date.
   *
   * @remarks
   * Reads Redis rather than the stream, since a delayed message has not been published to NATS at
   * all yet: it sits in the same sorted set `pushDelayed` wrote it into, and only reaches the
   * stream once its due date arrives.
   */
  async delayedCount(queue: RegisteredQueue): Future<number> {
    const delayed = await delayedCounts();
    return delayed.counts[queue.name] ?? 0;
  }

  async status(queue: RegisteredQueue): Future<QueueStatus> {
    await ensureTopology();
    return await queueStatus.one(queue);
  }

  startDraining(): void {
    queueRunner.start();
  }

  stopDraining(): void {
    queueRunner.stop();
  }

  #publish<T>(queue: RegisteredQueue, data: T): Future<string> {
    return topology.publish(queue.subject, encode({ data }));
  }
}
