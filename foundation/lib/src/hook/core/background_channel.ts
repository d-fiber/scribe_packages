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

import { Queue } from "@scribe/foundation/lib/src/queue/mod.ts";
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
    this.#queue ??= new Queue<T>(
      { name: `hook:${this.#hookName}` },
      async (payload: T) => {
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
