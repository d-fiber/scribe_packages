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

import { queueRegistry } from "@scribe/foundation/lib/src/queue/queue_registry.ts";
import { ensureTopology } from "@scribe/foundation/lib/src/queue/topology/ensure_topology.ts";
import { topology } from "@scribe/foundation/lib/src/queue/topology/topology.ts";
import { encode } from "@scribe/foundation/lib/src/queue/wire_message.ts";
import { forgetEvents, pendingEvents } from "./trigger_claim.ts";
import { matchesOf, type TriggerMatch } from "./trigger_match.ts";
import { queueNameOf } from "./trigger.ts";
import { triggerRegistry } from "./trigger_registry.ts";
import { eventFrom, type TriggerEvent } from "./trigger_event.ts";
import { DrainLock } from "./drain_lock.ts";
import { Duration, Future } from "@scribe/alchemy";
import { log } from "@scribe/alchemy/observe";

/** How long the loop waits between two passes. */
const DEFAULT_TICK: Duration = Duration.milliseconds(500);

/** How long a pass is claimed for, well above what a full batch takes. */
const LOCK_HELD_FOR: Duration = Duration.seconds(10);

/** How long a crashed loop stays down before it comes back. */
const RESTART_AFTER: Duration = Duration.seconds(5);

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
  start(tick: Duration = DEFAULT_TICK): void {
    if (this.#running) return;
    this.#running = true;

    this.#loop(tick).catch((error) => {
      log.error("trigger-runner.loop_crashed", {
        metadata: { restartingIn: RESTART_AFTER.toString(), error },
      });
      this.#running = false;
      Future.delayed(RESTART_AFTER).then(() => this.start(tick));
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
  async drain(): Future<number> {
    const rows = await pendingEvents();
    if (rows.length === 0) return 0;

    await ensureTopology();

    const published: number[] = [];

    for (const row of rows) {
      const event = eventFrom(row);

      if (event === null) {
        log.error("trigger-runner.event_unreadable", {
          metadata: { event: row.id, operation: row.op, consequence: "the event is dropped" },
        });
        published.push(row.id);
        continue;
      }

      if (await this.#publish(event)) published.push(row.id);
    }

    if (published.length === 0) return 0;

    const forgotten = await forgetEvents(published);
    if (!forgotten.ok) {
      log.error("trigger-runner.events_not_forgotten", {
        metadata: {
          events: published.length,
          consequence: "the rows are handed over again on the next pass",
          error: forgotten.error,
        },
      });
      return 0;
    }

    for (const id of published) _taken.delete(id);
    return published.length;
  }

  /**
   * Publishes one event to every declaration it concerns, and answers whether all of them took it.
   *
   * @remarks
   * Every declaration is reached, whether or not the one before it refused. Stopping at the first
   * refusal left the declarations after it waiting for a pass in which nobody ahead of them
   * fails, which for an event too large for one queue is never.
   *
   * A declaration that took the event is remembered, so a later pass over the same row does not
   * hand it the same event a second time. The memory is this process's: another replica draining
   * the same row publishes again, and the message id is what lets the stream drop the duplicate.
   */
  async #publish(event: TriggerEvent): Future<boolean> {
    const matches = matchesOf(triggerRegistry.list(), event);
    const already = _taken.get(event.id) ?? new Set<string>();
    let everyone = true;

    for (const match of matches) {
      if (already.has(match.trigger.name)) continue;

      if (await this.#deliver(event, match)) already.add(match.trigger.name);
      else everyone = false;
    }

    if (everyone) _taken.delete(event.id);
    else _taken.set(event.id, already);

    return everyone;
  }

  /** Publishes one event on one declaration's queue. */
  async #deliver(event: TriggerEvent, match: TriggerMatch): Future<boolean> {
    const queue = queueRegistry.get(queueNameOf(match.trigger.name));

    if (queue === null) {
      log.error("trigger-runner.no_queue", {
        metadata: { trigger: match.trigger.name, event: event.id, consequence: "the event is dropped" },
      });
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
      log.error("trigger-runner.publish_failed", {
        metadata: { trigger: match.trigger.name, event: event.id, error },
      });
      return false;
    }
  }

  /** Takes a pass when no other replica holds it, on every tick. */
  async #loop(tick: Duration): Future<void> {
    const lock = new DrainLock();

    while (this.#running) {
      if (await lock.claim(LOCK_HELD_FOR)) {
        try {
          await this.drain();
        } catch (error) {
          log.error("trigger-runner.pass_failed", { metadata: { error } });
        }
      }

      await Future.delayed(tick);
    }
  }
}

/** The runner every declaration is drained through, one per process. */
export const triggerRunner: TriggerRunner = new TriggerRunner();

/**
 * Which declarations have already taken each event this process could not finish publishing.
 *
 * @remarks
 * It lives beside the class because a pass is a new runner every time, and because what it
 * guards against is a row that stays in the table: an event one declaration refuses is handed
 * over again on the next pass, and without this the declarations that took it would receive it
 * once per pass for as long as the refusal lasts.
 *
 * An entry is dropped when the row is forgotten, which is the only moment the event stops
 * existing. A process that dies holding entries loses nothing but the deduplication.
 */
const _taken: Map<number, Set<string>> = new Map();
