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

import type { HookHandler } from "../../../contracts/hook/hook.ts";
import { isRefusal } from "./refusal.ts";

/** Past this, a chain is slow enough that somebody should be told. */
const SLOW_CHAIN_MS = 1_000;

/**
 * The subscribers that run inside the request, in the order they subscribed.
 *
 * The chain stops at the first refusal, the way an early `return` would, and an exception
 * propagates to the emitter after being logged: a handler that throws is a bug in the
 * project, and hiding it behind the fallback would make it invisible.
 */
export class InlineChain<T, R> {
  readonly #hookName: string;
  readonly #fallback: R;
  readonly #handlers: HookHandler<T, R>[] = [];

  constructor(hookName: string, fallback: R) {
    this.#hookName = hookName;
    this.#fallback = fallback;
  }

  /** How many handlers are subscribed. */
  get size(): number {
    return this.#handlers.length;
  }

  /** Subscribes a handler, and answers it back so the caller can keep a reference. */
  add(handler: HookHandler<T, R>): HookHandler<T, R> {
    this.#handlers.push(handler);
    return handler;
  }

  /**
   * Runs the chain and answers the last decision, or the fallback if there was none.
   *
   * An empty chain leaves before the clock is read, because reading it is only worth it when
   * there is something to time. A hook with no handler at all never reaches here, but one
   * whose only subscriber is a background handler does.
   */
  async run(payload: T): Promise<R> {
    if (this.#handlers.length === 0) return this.#fallback;

    const startedAt = Date.now();
    const outcome = await this.#chain(payload);
    this.#warnIfSlow(startedAt);
    return outcome;
  }

  /**
   * Hands the payload to each handler in turn, stopping at the first refusal.
   *
   * A handler is allowed to be synchronous, and awaiting a plain value still costs a turn of
   * the microtask queue, which on a chain of synchronous subscribers is the whole cost of
   * running it. The awaiting is therefore decided per answer rather than written once.
   */
  async #chain(payload: T): Promise<R> {
    let last: R = this.#fallback;

    for (const handler of this.#handlers) {
      try {
        const answered = handler(payload);
        last = isThenable(answered) ? await answered : answered;
      } catch (error) {
        console.error(`[hook:${this.#hookName}] handler failed`, error);
        throw error;
      }
      if (isRefusal(last)) return last;
    }

    return last;
  }

  /**
   * Logs a chain that ran longer than {@link SLOW_CHAIN_MS}, and lets it through.
   *
   * A warning rather than a limit: on a framework whose handlers are written by whoever uses
   * it, this is the difference between diagnosing in five minutes and in five hours.
   */
  #warnIfSlow(startedAt: number): void {
    const elapsed = Date.now() - startedAt;
    if (elapsed < SLOW_CHAIN_MS) return;

    console.warn(
      `[hook:${this.#hookName}] ${this.#handlers.length} inline handler(s) took ${elapsed}ms`,
    );
  }
}

function isThenable<R>(value: R | Promise<R>): value is Promise<R> {
  return typeof (value as Promise<R>)?.then === "function";
}
