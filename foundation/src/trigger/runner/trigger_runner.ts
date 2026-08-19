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

import { sleep } from "@scribe/core/runtime/support/async/sleep.ts";
import { queueRegistry } from "@scribe/foundation/src/queue/core/registry.ts";
import { ensureTopology } from "@scribe/foundation/src/queue/core/topology/ready.ts";
import { topology } from "@scribe/foundation/src/queue/core/topology/topology.ts";
import { encode } from "@scribe/foundation/src/queue/core/wire.ts";
import { forgetEvents, pendingEvents } from "../db/claim.ts";
import { matchesOf, type TriggerMatch } from "../core/match.ts";
import { queueNameOf } from "../core/trigger.ts";
import { triggerRegistry } from "../core/registry.ts";
import { eventFrom, type TriggerEvent } from "../core/wire.ts";
import { DrainLock } from "./drain_lock.ts";

/** How long the loop waits between two passes. */
const DEFAULT_TICK_MS = 500;
/** How long a pass is claimed for, well above what a full batch takes. */
const LOCK_HOLD_MS = 10_000;
const LOOP_RESTART_DELAY_MS = 5_000;

/**
 * The loop that carries what Postgres wrote to the queue that runs the bodies.
 *
 * A pass publishes first and deletes second, never the reverse. A replica that dies between
 * the two leaves a change published twice rather than not at all, which is the side the
 * at-least-once contract already sits on, and the message id lets JetStream drop the copy.
 */
export class TriggerRunner {
  #running = false;

  /**
   * Starts the loop, which is safe to do before a single declaration exists.
   *
   * A loop that crashes says so and restarts, because a process that quietly stopped draining
   * keeps answering requests while nothing reacts to them any more.
   */
  start(tickMs = DEFAULT_TICK_MS): void {
    if (this.#running) return;
    this.#running = true;

    this.#loop(tickMs).catch((error) => {
      console.error(
        `[trigger-runner] loop crashed, restarting in ${LOOP_RESTART_DELAY_MS}ms:`,
        error,
      );
      this.#running = false;
      setTimeout(() => this.start(tickMs), LOOP_RESTART_DELAY_MS);
    });
  }

  /** Stops the loop. A pass already under way is left to finish. */
  stop(): void {
    this.#running = false;
  }

  /**
   * Publishes one batch of the outbox, and answers how many rows left the table.
   *
   * A row nothing is declared for is dropped with the rest of the batch. Keeping it would make
   * it the oldest row of every following pass, and everything written behind it would wait on
   * a declaration that no longer exists.
   */
  async drain(): Promise<number> {
    const rows = await pendingEvents();
    if (rows.length === 0) return 0;

    await ensureTopology();

    const published: number[] = [];

    for (const row of rows) {
      const event = eventFrom(row);

      if (event === null) {
        console.error(`[trigger-runner] dropping event ${row.id}, unreadable operation "${row.op}"`);
        published.push(row.id);
        continue;
      }

      if (await this.#publish(event)) published.push(row.id);
    }

    if (published.length > 0) await forgetEvents(published);
    return published.length;
  }

  /** Publishes one event to every declaration it concerns, and answers whether all of them took it. */
  async #publish(event: TriggerEvent): Promise<boolean> {
    const matches = matchesOf(triggerRegistry.list(), event);

    for (const match of matches) {
      if (!await this.#deliver(event, match)) return false;
    }

    return true;
  }

  /** Publishes one event on one declaration's queue. */
  async #deliver(event: TriggerEvent, match: TriggerMatch): Promise<boolean> {
    const queue = queueRegistry.get(queueNameOf(match.trigger.name));

    if (queue === null) {
      console.error(
        `[trigger-runner] "${match.trigger.name}" has no queue, event ${event.id} dropped`,
      );
      return true;
    }

    const suffix = match.field === null ? "" : `:${match.field}`;

    try {
      await topology.publish(
        queue.subject,
        encode({ data: { ...event, field: match.field } }),
        `${match.trigger.name}:${event.id}${suffix}`,
      );
      return true;
    } catch (error) {
      console.error(`[trigger-runner] could not publish to "${match.trigger.name}":`, error);
      return false;
    }
  }

  /** Takes a pass when no other replica holds it, on every tick. */
  async #loop(tickMs: number): Promise<void> {
    const lock = new DrainLock();

    while (this.#running) {
      if (await lock.claim(LOCK_HOLD_MS)) {
        try {
          await this.drain();
        } catch (error) {
          console.error("[trigger-runner] pass failed:", error);
        }
      }

      await sleep(tickMs);
    }
  }
}

/** The runner every declaration is drained through, one per process. */
export const triggerRunner: TriggerRunner = new TriggerRunner();
