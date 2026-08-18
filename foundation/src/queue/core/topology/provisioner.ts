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
  DEAD_STREAM,
  DEDICATED_STREAM,
  sanitize,
  SHARED_CONSUMER,
  SHARED_STREAM,
  subjectOf,
} from "@scribe/foundation/src/queue/core/naming.ts";
import { AckPolicy, type JetStreamManager, RetentionPolicy, StorageType } from "@nats-io/jetstream";
import type { TopologyPlan } from "./plan.ts";

/**
 * Creates the streams and consumers a plan calls for, and widens what already exists.
 *
 * Provisioning is idempotent because it runs on every start-up of every replica: a stream
 * that exists is left alone, and a consumer an older deployment created is widened rather
 * than replaced.
 */
export class TopologyProvisioner {
  readonly #manager: JetStreamManager;

  constructor(manager: JetStreamManager) {
    this.#manager = manager;
  }

  async provision(plan: TopologyPlan): Promise<void> {
    await this.#stream(SHARED_STREAM, ["q.>"], RetentionPolicy.Workqueue, plan);
    await this.#stream(
      DEDICATED_STREAM,
      ["qd.>"],
      RetentionPolicy.Workqueue,
      plan,
    );
    await this.#stream(DEAD_STREAM, ["dead.>"], RetentionPolicy.Limits, plan);

    await this.#consumer(SHARED_STREAM, SHARED_CONSUMER, "q.>", plan);
    for (const name of plan.dedicated) {
      await this.#consumer(
        DEDICATED_STREAM,
        sanitize(name),
        subjectOf(name, true),
        plan,
      );
    }
  }

  async #stream(
    name: string,
    subjects: string[],
    retention: RetentionPolicy,
    plan: TopologyPlan,
  ): Promise<void> {
    const exists = await this.#manager.streams
      .info(name)
      .then(() => true)
      .catch(() => false);
    if (exists) return;

    await this.#manager.streams.add({
      name,
      subjects,
      retention,
      storage: StorageType.File,
      max_msgs_per_subject: plan.maxPerSubject,
    });
  }

  async #consumer(
    stream: string,
    durable: string,
    filterSubject: string,
    plan: TopologyPlan,
  ): Promise<void> {
    const ackWaitNs = plan.ackWaitMs * 1_000_000;
    const existing = await this.#manager.consumers
      .info(stream, durable)
      .catch(() => null);

    if (existing === null) {
      await this.#manager.consumers.add(stream, {
        durable_name: durable,
        filter_subject: filterSubject,
        ack_policy: AckPolicy.Explicit,
        max_deliver: plan.maxDeliver,
        ack_wait: ackWaitNs,
      });
      return;
    }

    // A consumer an earlier deployment created may be narrower than what the queues
    // declared since. Either bound left too low silently breaks a policy that depends on
    // it: too short an ack_wait redelivers work still in progress, and too low a
    // max_deliver stops the server before the dead letter is ever written.
    const widened: Record<string, number> = {};
    if ((existing.config.ack_wait ?? 0) < ackWaitNs) widened.ack_wait = ackWaitNs;
    if ((existing.config.max_deliver ?? 0) < plan.maxDeliver) {
      widened.max_deliver = plan.maxDeliver;
    }
    if (Object.keys(widened).length === 0) return;

    try {
      await this.#manager.consumers.update(stream, durable, widened);
    } catch (error) {
      console.error(
        `[queue] could not widen "${stream}/${durable}" to ${JSON.stringify(widened)}:`,
        error,
      );
    }
  }
}
