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
import type {
    BatchHandler,
    JobHandler,
    PushOptions,
    QueueOptions,
} from "@scribe/foundation/lib/src/queue/queue_options.ts";
import { limitsFrom, type RegisteredQueue, subjectsOf } from "./queue_declaration.ts";
import { delayedCounts } from "./delayed/delayed_counts.ts";
import { pushDelayed } from "./delayed/delayed_schedule.ts";
import { DEAD_STREAM, streamOf } from "./queue_naming.ts";
import { queueRegistry } from "./queue_registry.ts";
import { type QueueStatus, queueStatus } from "./queue_status.ts";
import { ensureTopology } from "./topology/ensure_topology.ts";
import { topology } from "./topology/topology.ts";
import { encode } from "./wire_message.ts";

/**
 * How many publications one call to {@link Queue.pushMany} keeps in flight.
 *
 * @remarks
 * High enough that a batch is not paced by the round trip time of one publication, low enough
 * that the memory a push costs is decided here and not by the length of the list a caller
 * happened to build.
 */
export const PUBLISH_AT_ONCE = 64;

/** What declaring a queue takes. */
export interface QueueDefinition {
  /** The name this queue is registered under, and which both its subjects are derived from. */
  readonly name: string;

  /** What this declaration tunes. What it leaves out is filled from the package defaults. */
  readonly options?: QueueOptions;
  /** Gives this queue a stream, a consumer and a loop of its own. */
  readonly dedicated?: boolean;
}

/**
 * A declaration whose handler is called with a group.
 *
 * `lingerMs` is how long a partial group waits for company before it is handed over.
 */
export interface BatchQueueDefinition extends QueueDefinition {
  /**
   * How long a partial group waits for company, in milliseconds.
   *
   * Its presence is what puts this queue in batch mode, so the object stays even when the
   * delay itself is left to the default.
   */
  readonly batch: { readonly lingerMs?: number };
}

/**
 * What can be done with a queue that already exists.
 *
 * It is split from {@link Queue} for one caller: the worker bridge pushes to a queue the host
 * declared, so it needs everything below without declaring anything. Constructing a `Queue`
 * there would register a second one under a name already taken, and throw.
 */
export class QueuePublisher<in TJob> {
  protected readonly queue: RegisteredQueue;

  constructor(queue: RegisteredQueue) {
    this.queue = queue;
  }

  get name(): string {
    return this.queue.name;
  }

  async push(data: TJob, opts: PushOptions = {}): Future<string> {
    if (opts.delay && opts.delay.inMilliseconds > 0) {
      return await pushDelayed(
        this.queue.name,
        this.queue.subject,
        data,
        opts.delay.inMilliseconds,
      );
    }

    await ensureTopology();
    return await this.#publish(data);
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
  async pushMany(items: UnmodifiableList<TJob>): Future<string[]> {
    if (items.length === 0) return [];

    await ensureTopology();
    const ids: string[] = new Array(items.length);
    await runPooled([...items.keys()], PUBLISH_AT_ONCE, async (at) => {
      ids[at] = await this.#publish(items[at]);
    });

    return ids;
  }

  async size(): Future<number> {
    await ensureTopology();
    return await topology.countBySubject(
      streamOf(this.queue.dedicated),
      this.queue.subject,
    );
  }

  async deadCount(): Future<number> {
    await ensureTopology();
    return await topology.countBySubject(DEAD_STREAM, this.queue.deadSubject);
  }

  async delayedCount(): Future<number> {
    const delayed = await delayedCounts();
    return delayed.counts[this.queue.name] ?? 0;
  }

  async status(): Future<QueueStatus> {
    await ensureTopology();
    return await queueStatus.one(this.queue);
  }

  #publish(data: TJob): Future<string> {
    return topology.publish(this.queue.subject, encode({ data }));
  }
}

/**
 * A durable queue: declaring it and holding its producer are the same thing.
 *
 * ```ts
 * const emails = new Queue<EmailJob>({ name: "emails" }, async (job) => { ... });
 * await emails.push({ to: "a@b.c" });
 * ```
 *
 * Declaration and body stay in one call on purpose: a queue whose body lives elsewhere is a
 * queue nobody can read the meaning of from its name. Constructing one registers it, which is
 * what lets the runner find the body for a subject it is handed.
 *
 * Draining is deliberately absent from the surface. A pass over a queue belongs to the runner,
 * and `core/` is not allowed to reach into `runner/`.
 */
export class Queue<in TJob> extends QueuePublisher<TJob> {
  /** Declares a queue whose body is called once with a group of payloads. */
  constructor(definition: BatchQueueDefinition, handler: BatchHandler<TJob>);
  /** Declares a queue whose body is called once per message. */
  constructor(definition: QueueDefinition, handler: JobHandler<TJob>);
  constructor(
    definition: QueueDefinition | BatchQueueDefinition,
    handler: JobHandler<TJob> | BatchHandler<TJob>,
  ) {
    const batch = (definition as BatchQueueDefinition).batch;
    const dedicated = definition.dedicated === true;

    super({
      name: definition.name,
      ...subjectsOf(definition.name, dedicated),
      mode: batch ? "batch" : "immediate",
      dedicated,
      lingerMs: batch?.lingerMs,
      handler: handler as JobHandler<unknown> | BatchHandler<unknown>,
      ...limitsFrom(definition.options),
    });

    queueRegistry.add(this.queue);
  }
}
