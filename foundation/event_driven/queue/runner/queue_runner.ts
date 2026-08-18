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

import { promoteDue } from "@scribe/host/packages/foundation/event_driven/queue/core/delayed/promoter.ts";
import { queueRegistry } from "@scribe/host/packages/foundation/event_driven/queue/core/registry.ts";
import { ensureTopology } from "@scribe/host/packages/foundation/event_driven/queue/core/topology/ready.ts";
import type { DrainResult } from "@scribe/host/packages/foundation/event_driven/queue/contract.ts";
import { MessageDispatcher } from "./dispatcher.ts";
import { DrainTally } from "./drain_tally.ts";
import { StreamSource } from "./sources/stream_source.ts";
import { SupervisedLoop } from "./supervised_loop.ts";

const FETCH_COUNT = 100;

export class QueueRunner {
  readonly #dispatcher = new MessageDispatcher();
  #running = false;
  #generation = 0;

  async run(count = FETCH_COUNT): Promise<DrainResult> {
    const tally = await this.#prepare();

    const batches = await Promise.all(
      this.#allSources().map((source) => source.fetch(count)),
    );
    await this.#dispatcher.dispatch(batches.flat(), tally);

    return tally.toResult();
  }

  async runOne(name: string, count = FETCH_COUNT): Promise<DrainResult | null> {
    const queue = queueRegistry.get(name);
    if (!queue) return null;

    const tally = await this.#prepare();
    const messages = await StreamSource.forQueue(queue).fetch(count);

    if (!queue.dedicated && messages.length > 0) {
      console.info(
        `[queue-runner] "${name}" reads the shared consumer, this pass covers ${messages.length} message(s) of every shared queue`,
      );
    }
    await this.#dispatcher.dispatch(messages, tally);

    return tally.toResult();
  }

  names(): readonly string[] {
    return queueRegistry.list().map((queue) => queue.name);
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;

    const generation = ++this.#generation;
    const alive = () => this.#running && this.#generation === generation;

    for (const source of this.#allSources()) {
      new SupervisedLoop(
        source.label,
        () => this.#pass(source),
        alive,
        ensureTopology,
      ).start();
    }
  }

  stop(): void {
    this.#running = false;
  }

  async #prepare(): Promise<DrainTally> {
    await ensureTopology();

    const tally = new DrainTally();
    tally.promote(await promoteDue());
    return tally;
  }

  #allSources(): readonly StreamSource[] {
    return [
      StreamSource.shared(),
      ...queueRegistry.dedicated().map((queue) => StreamSource.dedicated(queue)),
    ];
  }

  async #pass(source: StreamSource): Promise<void> {
    if (source.promotesDelayed) await promoteDue();

    const tally = new DrainTally();
    await this.#dispatcher.dispatch(await source.fetch(FETCH_COUNT), tally);
  }
}

export const queueRunner: QueueRunner = new QueueRunner();
