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

import { defineQueue, type Queue } from "@scribe/foundation/src/queue/mod.ts";
import type { BackgroundHookHandler } from "../../../contracts/hook/hook.ts";

/**
 * The subscribers that run later, on a queue declared the first time one subscribes.
 *
 * A hook nobody subscribed to this way never declares a queue, so the ten extension points
 * the framework ships cost nothing to a project that ignores them.
 */
export class BackgroundChannel<T> {
  readonly #hookName: string;
  readonly #handlers: BackgroundHookHandler<T>[] = [];
  #queue: Queue<T> | null = null;

  constructor(hookName: string) {
    this.#hookName = hookName;
  }

  /** How many handlers are subscribed. */
  get size(): number {
    return this.#handlers.length;
  }

  /** Whether a queue has been declared for this hook. */
  get armed(): boolean {
    return this.#queue !== null;
  }

  /** Subscribes a handler, declaring the queue on the first one. */
  add(handler: BackgroundHookHandler<T>): BackgroundHookHandler<T> {
    this.#handlers.push(handler);
    this.#queue ??= defineQueue<T>(
      { name: `hook:${this.#hookName}` },
      async (payload) => {
        for (const background of this.#handlers) await background(payload);
      },
    );
    return handler;
  }

  /**
   * Hands the payload to the queue, and swallows a failure to do so.
   *
   * This is the one place in the engine where work can be lost, hence the log. Failing the
   * operation because a deferred side effect could not be queued would be worse: the
   * operation itself succeeded, and the caller has nothing to do with NATS being down.
   */
  async enqueue(payload: T): Promise<void> {
    if (this.#queue === null) return;

    try {
      await this.#queue.push(payload);
    } catch (error) {
      console.error(
        `[hook:${this.#hookName}] could not enqueue background work`,
        error,
      );
    }
  }
}
