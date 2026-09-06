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
import { initRegistry } from "./init_registry.ts";

/** The body of a one-time job. Throwing stops the runner before it tracks this job as done. */
export type InitHandler = () => Future<void>;

/**
 * Marks a method as a job that runs once, ever, the first time a fresh stack boots — the
 * potentially slow, one-time work a project or a package cannot do without: seeding a default
 * account, backfilling a table, calling out to provision something external.
 *
 * ```ts
 * @Lifecycle()
 * export class Seeds {
 *   @Init()
 *   async seedDefaultAdmin(): Future<void> {
 *     await database.internal_t__admin_users().insertOne({ email: "admin@example.com" });
 *   }
 * }
 * ```
 *
 * The class it lives on must carry `@Lifecycle()`, which is what builds the instance this method
 * needs to run bound to `this`. A project or a package may write as many `@Lifecycle` classes as
 * it likes, each with its own `@Init` — but only one per class: the name it registers under is the
 * class's own name, so a second `@Init` on the same class collides with the first, the same way a
 * second `new Cron(...)` under a name already taken would.
 *
 * Nothing in the process that answers requests ever loads what this registers: only the dedicated
 * `init` container does, once per stack, before `api`, `worker` and `rest` start. A method
 * therefore never races another replica over the same job.
 *
 * @throws {Error} When applied to anything but an instance method.
 */
export function Init() {
  return function <This extends object, Fn extends InitHandler>(
    target: Fn,
    context: ClassMethodDecoratorContext<This, Fn>,
  ): void {
    if (context.kind !== "method" || context.static) {
      throw new Error(`@Init() on "${String(context.name)}": only an instance method can be marked.`);
    }

    context.addInitializer(function (this: This): void {
      const name = (this.constructor as { name: string }).name;
      initRegistry.add({ name, handler: () => target.call(this) });
    });
  };
}
