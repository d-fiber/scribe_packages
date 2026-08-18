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

import type { BatchHandler, JobHandler, PushOptions, QueueOptions } from "@scribe/foundation/contracts/queue/queue.ts";
import { limitsFrom, type RegisteredQueue, subjectsOf } from "./declaration.ts";
import { queueRegistry } from "./registry.ts";
import { delayedCounts } from "./delayed/counts.ts";
import { pushDelayed } from "./delayed/schedule.ts";
import { DEAD_STREAM, streamOf } from "./naming.ts";
import { type QueueStatus, queueStatus } from "./status.ts";
import { ensureTopology } from "./topology/ready.ts";
import { topology } from "./topology/topology.ts";
import { encode } from "./wire.ts";

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
export class QueuePublisher<TJob> {
  protected readonly queue: RegisteredQueue;

  constructor(queue: RegisteredQueue) {
    this.queue = queue;
  }

  get name(): string {
    return this.queue.name;
  }

  async push(data: TJob, opts: PushOptions = {}): Promise<string> {
    if (opts.delay && opts.delay.ms > 0) {
      return await pushDelayed(
        this.queue.name,
        this.queue.subject,
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
      streamOf(this.queue.dedicated),
      this.queue.subject,
    );
  }

  async deadCount(): Promise<number> {
    await ensureTopology();
    return await topology.countBySubject(DEAD_STREAM, this.queue.deadSubject);
  }

  async delayedCount(): Promise<number> {
    const delayed = await delayedCounts();
    return delayed.counts[this.queue.name] ?? 0;
  }

  async status(): Promise<QueueStatus> {
    await ensureTopology();
    return await queueStatus.one(this.queue);
  }

  #publish(data: TJob): Promise<string> {
    return topology.publish(this.queue.subject, encode({ data }));
  }
}

/**
 * A durable queue: declaring it and holding its producer are the same thing.
 *
 * ```ts
 * const emails = new Queue<EmailJob>({ name: "emails" }, async (job) => { … });
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
export class Queue<TJob> extends QueuePublisher<TJob> {
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
