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

import { BackgroundChannel } from "./background_channel.ts";
import type { BackgroundHookHandler, HookHandler } from "./handler.ts";
import { InlineChain } from "./inline_chain.ts";
import { isRefusal } from "./refusal.ts";
import { hookRegistry } from "./registry.ts";

export interface HookDefinition<T, R> {
  readonly name: string;
  readonly fallback: R;
}

export class Hook<T, R = void> {
  readonly name: string;

  readonly #inline: InlineChain<T, R>;
  readonly #background: BackgroundChannel<T>;

  constructor(definition: HookDefinition<T, R>) {
    this.name = definition.name;
    this.#inline = new InlineChain<T, R>(definition.name, definition.fallback);
    this.#background = new BackgroundChannel<T>(definition.name);
    hookRegistry.add(this);
  }

  handlers(): number {
    return this.#inline.size + this.#background.size;
  }

  on(handler: HookHandler<T, R>): HookHandler<T, R> {
    return this.#inline.add(handler);
  }

  background(handler: BackgroundHookHandler<T>): BackgroundHookHandler<T> {
    return this.#background.add(handler);
  }

  async run(payload: T): Promise<R> {
    const decision = await this.#inline.run(payload);

    if (!isRefusal(decision)) await this.#background.enqueue(payload);

    return decision;
  }
}
