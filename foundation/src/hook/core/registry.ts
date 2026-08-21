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

/**
 * A hook as the registry holds it.
 *
 * The interface exists for one caller: a worker emits by **name**, so it needs to reach a
 * hook it cannot import.
 */
export interface RegisteredHook {
  /** The name this hook was declared under, and the one a worker emits by. */
  readonly name: string;

  /** How many handlers are subscribed, inline and background counted together. */
  handlers(): number;

  /**
   * Emits `payload` and answers what the chain decided.
   *
   * The payload is `never` and the answer `unknown` because the registry holds every hook of
   * the process side by side, and their types have nothing in common. A caller reaching a
   * hook by name is outside what the compiler can check for it.
   */
  run(payload: never): Promise<unknown>;
}

/**
 * Every declared hook of this process, indexed by name.
 *
 * Registration is a consequence of the module graph, since importing the file that declares a
 * hook declares it, so there is no initialization to call and nothing that can forget to.
 */
export class HookRegistry {
  readonly #hooks = new Map<string, RegisteredHook>();

  add(hook: RegisteredHook): void {
    const existing = this.#hooks.get(hook.name);
    if (existing && existing !== hook) {
      throw new Error(
        `new Hook("${hook.name}"): this name is already declared. ` +
          `A hook name identifies an extension point, it must be unique.`,
      );
    }
    this.#hooks.set(hook.name, hook);
  }

  get(name: string): RegisteredHook | null {
    return this.#hooks.get(name) ?? null;
  }

  list(): readonly RegisteredHook[] {
    return [...this.#hooks.values()];
  }

  report(): string {
    const all = this.list();
    const idle = all.filter((h) => h.handlers() === 0).map((h) => h.name);
    const summary = `${all.length} declared · ${all.length - idle.length} with a handler`;
    return idle.length === 0
      ? `[hooks] ${summary}`
      : `[hooks] ${summary} · without a handler (no-op): ${idle.join(", ")}`;
  }
}

/** The registry every declaration writes into. */
export const hookRegistry: HookRegistry = new HookRegistry();
