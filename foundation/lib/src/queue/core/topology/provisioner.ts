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

import {
  DEAD_STREAM,
  DEDICATED_STREAM,
  sanitize,
  SHARED_CONSUMER,
  SHARED_STREAM,
  subjectOf,
} from "@scribe/foundation/lib/src/queue/core/naming.ts";
import {
  AckPolicy,
  type JetStreamManager,
  RetentionPolicy,
  StorageType,
} from "@nats-io/jetstream";
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

  /**
   * Creates the durable consumer `plan` describes, or widens the one already there.
   *
   * A consumer an earlier deployment created may be narrower than what the queues have
   * declared since, and either bound left too low silently breaks a policy that depends on it:
   * too short an `ack_wait` redelivers work still in progress, and too low a `max_deliver`
   * stops the server before the dead letter is ever written. Bounds are therefore only ever
   * raised, never lowered.
   */
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

    const widened: Record<string, number> = {};
    if ((existing.config.ack_wait ?? 0) < ackWaitNs) {
      widened.ack_wait = ackWaitNs;
    }
    if ((existing.config.max_deliver ?? 0) < plan.maxDeliver) {
      widened.max_deliver = plan.maxDeliver;
    }
    if (Object.keys(widened).length === 0) return;

    try {
      await this.#manager.consumers.update(stream, durable, widened);
    } catch (error) {
      console.error(
        `[queue] could not widen "${stream}/${durable}" to ${
          JSON.stringify(widened)
        }:`,
        error,
      );
    }
  }
}
