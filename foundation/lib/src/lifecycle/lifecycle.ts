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

/** A class this framework builds on its own, so its `@Init`/`@Run` methods declare themselves. */
type Constructible = new () => object;

/**
 * Marks a class as one this framework instantiates itself, the moment the class is evaluated.
 *
 * @remarks
 * `@Init` and `@Run` are instance method decorators: the method they mark only really exists once
 * something builds an instance, because that is what a method decorator's `addInitializer` needs
 * `this` for. Left to the author, that would mean writing `new Example()` by hand at the bottom of
 * every file — one more step to forget, and one that a class with only static concerns has no
 * other reason to need. `@Lifecycle` does it instead: applying it to a class calls `new target()`
 * as soon as the class is defined, which is also the moment `@Init`/`@Run` register whatever they
 * marked.
 *
 * ```ts
 * @Lifecycle()
 * export class Seeds {
 *   @Init()
 *   async seedDefaultAdmin(): Future<void> { ... }
 *
 *   @Run()
 *   async warmCache(): Future<void> { ... }
 * }
 * ```
 *
 * A project or a package may write as many `@Lifecycle` classes as it likes. Within one class,
 * `@Init` and `@Run` each read the class's own name as the identity they register under, so a
 * second `@Init` or a second `@Run` on the same class collides with the first the same way two
 * `new Cron("same-name", ...)` would — one class, one of each at most.
 *
 * The constructor must take no arguments: this decorator is the only caller, and it has nothing to
 * pass one. A class with state to share between its own `@Init` and `@Run` methods keeps it on
 * `this`, set in the constructor body.
 */
export function Lifecycle() {
  return function (target: Constructible, _context: ClassDecoratorContext<Constructible>): void {
    new target();
  };
}
