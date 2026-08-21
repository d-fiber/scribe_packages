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

import { js, jsm } from "@scribe/foundation/src/queue/nats.ts";
import type { JsMsg } from "@nats-io/jetstream";
import { ConsumerCache } from "./consumer_cache.ts";
import { type GraceResolver, lingerFetch } from "./linger_fetch.ts";
import { planSignature, type TopologyPlan } from "./plan.ts";
import { TopologyProvisioner } from "./provisioner.ts";

class Topology {
  readonly #consumers = new ConsumerCache();
  #applied: string | null = null;
  #ready: Promise<void> | null = null;

  /**
   * Applies a plan, and remembers it so an unchanged one costs nothing.
   *
   * Two mistakes are avoided here, and both were paid for. Memoizing without looking at the
   * plan freezes the first caller's for the life of the process, so a queue declared later
   * never gets its consumer. And memoizing a failure condemns the process: a NATS outage at
   * start-up would leave a rejected promise in the slot and every later push would await it.
   */
  ensure(plan: TopologyPlan): Promise<void> {
    const signature = planSignature(plan);
    if (this.#ready !== null && this.#applied === signature) return this.#ready;

    this.#applied = signature;
    return (this.#ready = this.#provision(plan).catch((error) => {
      this.#applied = null;
      this.#ready = null;
      throw error;
    }));
  }

  async publish(
    subject: string,
    payload: Uint8Array,
    msgID?: string,
  ): Promise<string> {
    const stream = await js();
    const ack = await stream.publish(
      subject,
      payload,
      msgID ? { msgID } : undefined,
    );
    return String(ack.seq);
  }

  async fetch(
    stream: string,
    durable: string,
    count: number,
    expiresMs: number,
    graceFor?: GraceResolver,
  ): Promise<JsMsg[]> {
    if (count <= 0) return [];

    const consumer = await this.#consumers.get(stream, durable);
    return lingerFetch(consumer, count, expiresMs, graceFor);
  }

  /**
   * How many messages are waiting on a subject, or zero when the server did not answer.
   *
   * The failure is logged before the zero is returned. A status screen that reports an empty
   * queue during a NATS outage is the more misleading of the two possible lies.
   */
  async countBySubject(stream: string, subject: string): Promise<number> {
    try {
      const manager = await jsm();
      const info = await manager.streams.info(stream, {
        subjects_filter: subject,
      });
      return info.state.subjects?.[subject] ?? 0;
    } catch (error) {
      console.error(
        `[queue] could not count "${subject}" on "${stream}", reporting 0:`,
        error,
      );
      return 0;
    }
  }

  async #provision(plan: TopologyPlan): Promise<void> {
    await new TopologyProvisioner(await jsm()).provision(plan);
  }
}

/** The NATS side of the queue: provisioning, publishing, fetching and counting. */
export const topology: Topology = new Topology();
