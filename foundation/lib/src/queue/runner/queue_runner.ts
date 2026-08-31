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

import { type Future, type UnmodifiableList } from "@scribe/alchemy";
import { log } from "@scribe/alchemy/observe";
import { promoteDue } from "../delayed/delayed_promoter.ts";
import { queueRegistry } from "../queue_registry.ts";
import { ensureTopology } from "../topology/ensure_topology.ts";
import type { DrainResult } from "../queue_options.ts";
import { MessageDispatcher } from "./message_dispatcher.ts";
import { DrainTally } from "./drain_tally.ts";
import { StreamSource } from "./stream_source.ts";
import { SupervisedLoop } from "./supervised_loop.ts";

const FETCH_COUNT = 100;

/**
 * The loops that drain the queues, and the passes an operator can ask for by hand.
 *
 * Each loop carries a generation, so a `stop()` followed by a `start()` does not end up with
 * two of them: an old loop parked in a fetch would otherwise wake up beside the new one.
 */
export class QueueRunner {
  readonly #dispatcher = new MessageDispatcher();
  #running = false;
  #generation = 0;

  /**
   * One pass over every source, fetching at most `count` messages from each and dispatching them.
   *
   * @remarks
   * The manual counterpart to what {@link start} runs continuously: a single deterministic drain
   * a caller can await and inspect the {@link DrainResult} of, rather than a background loop it
   * would then have to stop again to observe the same thing.
   */
  async run(count = FETCH_COUNT): Future<DrainResult> {
    const tally = await this.#prepare();

    const batches = await Promise.all(
      this.#allSources().map((source) => source.fetch(count)),
    );
    await this.#dispatcher.dispatch(batches.flat(), tally);

    return tally.toResult();
  }

  /**
   * Runs one pass aimed at a queue, and answers what it did.
   *
   * On a shared queue the aim is approximate and the runner says so: the consumer is shared,
   * there is no filtered fetch, so the pass takes whatever was waiting across every shared
   * queue. Only a queue that asked for isolation gets a pass that is really its own.
   */
  async runOne(name: string, count = FETCH_COUNT): Future<DrainResult | null> {
    const queue = queueRegistry.get(name);
    if (!queue) return null;

    const tally = await this.#prepare();
    const messages = await StreamSource.forQueue(queue).fetch(count);

    if (!queue.dedicated && messages.length > 0) {
      log.info("queue-runner.shared_pass", {
        metadata: { queue: name, covered: messages.length, scope: "every shared queue" },
      });
    }
    await this.#dispatcher.dispatch(messages, tally);

    return tally.toResult();
  }

  /** The name of every registered queue this runner can drain, for a caller that wants to name one to {@link runOne} without reading the registry itself. */
  names(): UnmodifiableList<string> {
    return queueRegistry.list().map((queue) => queue.name);
  }

  /**
   * Starts a supervised loop per source. Does nothing when this runner is already running.
   *
   * @remarks
   * The generation captured here is what the class doc's guard against a double `start` relies
   * on: a loop from an older generation checks `alive` on every turn, so a `stop` followed
   * immediately by a `start` leaves the old loop's own check failing rather than racing the new one.
   */
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

  /** Signals every running loop to stop after its current pass. */
  stop(): void {
    this.#running = false;
  }

  async #prepare(): Future<DrainTally> {
    await ensureTopology();

    const tally = new DrainTally();
    tally.promote(await promoteDue());
    return tally;
  }

  #allSources(): UnmodifiableList<StreamSource> {
    return [
      StreamSource.shared(),
      ...queueRegistry.dedicated().map((queue) => StreamSource.dedicated(queue)),
    ];
  }

  async #pass(source: StreamSource): Future<void> {
    if (source.promotesDelayed) await promoteDue();

    const tally = new DrainTally();
    await this.#dispatcher.dispatch(await source.fetch(FETCH_COUNT), tally);
  }
}

/** The runner of this process, started once by its bootstrapper. */
export const queueRunner: QueueRunner = new QueueRunner();
