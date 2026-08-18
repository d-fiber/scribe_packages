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

import type { HookHandler } from "./handler.ts";
import { isRefusal } from "./refusal.ts";

const SLOW_CHAIN_MS = 1_000;

export class InlineChain<T, R> {
  readonly #hookName: string;
  readonly #fallback: R;
  readonly #handlers: HookHandler<T, R>[] = [];

  constructor(hookName: string, fallback: R) {
    this.#hookName = hookName;
    this.#fallback = fallback;
  }

  get size(): number {
    return this.#handlers.length;
  }

  add(handler: HookHandler<T, R>): HookHandler<T, R> {
    this.#handlers.push(handler);
    return handler;
  }

  async run(payload: T): Promise<R> {
    const startedAt = Date.now();
    const outcome = await this.#chain(payload);
    this.#warnIfSlow(startedAt);
    return outcome;
  }

  async #chain(payload: T): Promise<R> {
    let last: R = this.#fallback;

    for (const handler of this.#handlers) {
      try {
        last = await handler(payload);
      } catch (error) {
        console.error(`[hook:${this.#hookName}] handler failed`, error);
        throw error;
      }
      if (isRefusal(last)) return last;
    }

    return last;
  }

  #warnIfSlow(startedAt: number): void {
    const elapsed = Date.now() - startedAt;
    if (elapsed < SLOW_CHAIN_MS) return;

    console.warn(
      `[hook:${this.#hookName}] ${this.#handlers.length} inline handler(s) took ${elapsed}ms`,
    );
  }
}
