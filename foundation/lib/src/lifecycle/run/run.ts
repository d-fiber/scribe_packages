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

import type { Future } from "@scribe/alchemy";
import { runRegistry } from "./run_registry.ts";

/** The body of a job that runs on every launch. Throwing stops the runner. */
export type RunHandler = () => Future<void>;

/**
 * Marks a method as a job that runs once **every time the stack launches**, after everything
 * else has answered healthy — `api`, `worker`, `rest`, the gateway and the proxy. Unlike `@Init`,
 * nothing is tracked: a `@Run` method plays on every `scribe run`/`scribe deploy`, restart
 * included, never only the first one.
 *
 * ```ts
 * @Lifecycle()
 * export class Seeds {
 *   @Init()
 *   async seedDefaultAdmin(): Future<void> { ... } // once, ever, before anything answers
 *
 *   @Run()
 *   async warmCache(): Future<void> { ... } // every launch, once everything answers
 * }
 * ```
 *
 * `@Init` is for the slow, one-time work a fresh stack cannot do without and that nothing else
 * should wait behind more than once. `@Run` is for the short signal that only makes sense once the
 * stack it is signalling about is actually up — pinging the running `api` over HTTP rather than
 * the database directly, telling an external service a deploy just finished, a smoke test.
 *
 * The class it lives on must carry `@Lifecycle()`, for the same reason `@Init` needs it: an
 * instance has to exist for the method to run bound to `this`. Only one `@Run` per class, keyed by
 * the class's own name, the same rule `@Init` follows.
 *
 * Nothing in the process that answers requests ever loads what this registers: only the dedicated
 * `run` container does, once per launch, after `api`, `worker`, `rest`, `kong` and `caddy` are all
 * healthy.
 *
 * @throws {Error} When applied to anything but an instance method.
 */
export function Run() {
  return function <This extends object, Fn extends RunHandler>(
    target: Fn,
    context: ClassMethodDecoratorContext<This, Fn>,
  ): void {
    if (context.kind !== "method" || context.static) {
      throw new Error(`@Run() on "${String(context.name)}": only an instance method can be marked.`);
    }

    context.addInitializer(function (this: This): void {
      const name = (this.constructor as { name: string }).name;
      runRegistry.add({ name, handler: () => target.call(this) });
    });
  };
}
