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

import { Duration, type Future, Stopwatch, TimeoutException, withDeadline } from "@scribe/alchemy";
import { log } from "@scribe/alchemy/observe";
import type { HookHandler } from "./hook_handler.ts";
import { isRefusal } from "./is_refusal.ts";

/** Past this, a chain is slow enough that somebody should be told. */
const SLOW_CHAIN: Duration = Duration.seconds(1);

/**
 * How long one handler is given to answer before the chain gives up on it.
 *
 * @remarks
 * A handler answers with whatever it likes, and anything carrying a `then` is awaited. One that
 * never calls back parks the emission for as long as the process lives, and with it the request
 * that emitted the hook. The ceiling is generous, because it is not a latency budget: it is what
 * separates a slow handler from one that will never answer.
 */
const HANDLER_CEILING: Duration = Duration.seconds(30);

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
  readonly #within: Duration;
  #insideHandler = false;

  constructor(hookName: string, fallback: R, within: Duration = HANDLER_CEILING) {
    this.#hookName = hookName;
    this.#fallback = fallback;
    this.#within = within;
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
  async run(payload: T): Future<R> {
    if (this.#handlers.length === 0) return this.#fallback;
    if (this.#insideHandler) return this.#reentered();

    const spent = new Stopwatch();
    spent.start();
    const outcome = await this.#chain(payload);
    spent.stop();

    this.#warnIfSlow(spent.elapsed);
    return outcome;
  }

  /**
   * What an emission made from inside this chain answers, which is the fallback.
   *
   * @remarks
   * A handler that emits the hook it is on nests one emission inside the last. Nothing ends that
   * on its own: it runs until the stack gives out, or until a counter the handler happens to
   * carry stops it, and every level of it holds the request that started the first emission.
   *
   * What is refused is an emission made while a handler of this chain is on the stack, not one
   * made while an emission is in flight. Two requests emitting the same hook at the same moment
   * are two emissions and both run; only the one a handler makes of its own hook is turned back.
   * A handler that awaits something first and re-emits afterwards is not caught, because by then
   * nothing separates it from any other caller.
   */
  #reentered(): R {
    log.error("hook.reentered", {
      metadata: {
        hook: this.#hookName,
        consequence: "the nested emission answers the fallback and runs no handler",
      },
    });
    return this.#fallback;
  }

  /**
   * Hands the payload to each handler in turn, stopping at the first refusal.
   *
   * A handler is allowed to be synchronous, and awaiting a plain value still costs a turn of
   * the microtask queue, which on a chain of synchronous subscribers is the whole cost of
   * running it. The awaiting is therefore decided per answer rather than written once.
   *
   * An answer that is awaited is bounded by the ceiling this chain was opened with, because what
   * carries a `then` is not always a promise and not everything that is one ever settles. It is
   * adopted into a promise first, for the same reason: a handler may answer any object carrying
   * a `then`, and the deadline needs something it can race.
   */
  async #chain(payload: T): Future<R> {
    let last: R = this.#fallback;

    for (const handler of this.#handlers) {
      try {
        this.#insideHandler = true;
        let answered: R | Future<R>;
        try {
          answered = handler(payload);
        } finally {
          this.#insideHandler = false;
        }

        last = isThenable(answered)
          ? await withDeadline(`hook:${this.#hookName}`, this.#within, Promise.resolve(answered))
          : answered;
      } catch (error) {
        if (error instanceof TimeoutException) return this.#gaveUpOn(error, last);

        log.error("hook.handler_failed", { metadata: { hook: this.#hookName, error } });
        throw error;
      }
      if (isRefusal(last)) return last;
    }

    return last;
  }

  /**
   * Logs a chain that ran longer than {@link SLOW_CHAIN}, and lets it through.
   *
   * A warning rather than a limit: on a framework whose handlers are written by whoever uses
   * it, this is the difference between diagnosing in five minutes and in five hours.
   */
  /**
   * Ends the chain on a handler that never answered, keeping the decision made so far.
   *
   * @remarks
   * It is not raised to the emitter, unlike a handler that throws. A handler throwing is a bug
   * in the project and hiding it would make it invisible; a handler that never answers is one
   * the chain has already given up on, and taking the emitter down with it would turn a hook
   * nobody is waiting on into a failed request.
   */
  #gaveUpOn(error: TimeoutException, last: R): R {
    log.error("hook.handler_never_answered", {
      metadata: {
        hook: this.#hookName,
        within: this.#within.toString(),
        consequence: "the chain stops here and answers what it had",
        error,
      },
    });
    return last;
  }

  #warnIfSlow(spent: Duration): void {
    if (spent.compareTo(SLOW_CHAIN) < 0) return;

    log.warn("hook.chain_slow", {
      metadata: { hook: this.#hookName, handlers: this.#handlers.length, took: spent.toString() },
    });
  }
}

function isThenable<R>(value: R | Future<R>): value is Future<R> {
  return typeof (value as Future<R>)?.then === "function";
}
