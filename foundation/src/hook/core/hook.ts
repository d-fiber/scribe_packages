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
import type { BackgroundHookHandler, HookHandler } from "../../../contracts/hook/hook.ts";
import { InlineChain } from "./inline_chain.ts";
import { isRefusal } from "./refusal.ts";
import { hookRegistry } from "./registry.ts";

/** What declaring a hook takes: its name, and what it answers when nobody listens. */
export interface HookDefinition<R> {
  /**
   * The name this hook is registered under.
   *
   * It has to be unique across the process, because it is what a worker emits by when it
   * cannot import the hook itself.
   */
  readonly name: string;

  /**
   * What the hook answers when no inline handler has decided.
   *
   * Required as soon as the hook carries a decision, so what happens when the project wires
   * nothing is always written down rather than inferred. A hook whose subscribers are side
   * effects has nothing to decide and leaves it out.
   */
  readonly fallback?: R;
}

/**
 * An extension point: the framework declares it, the project subscribes to it.
 *
 * ```ts
 * export const signInHook = new Hook<SignInPayload>({ name: "auth.sign-in" });
 * export const signUpHook = new Hook<SignUpPayload, Result>({
 *   name: "auth.sign-up",
 *   fallback: new OK(),
 * });
 * ```
 *
 * Two ways to subscribe, chosen per subscriber and not per hook. {@link on} runs inside the
 * request, in order, and may refuse; {@link background} runs later, survives a crash, and
 * cannot. The same event can carry both.
 */
export class Hook<T, R = void> {
  readonly name: string;

  readonly #inline: InlineChain<T, R>;
  readonly #background: BackgroundChannel<T>;

  /**
   * The answer of a hook nobody listens to, resolved once and handed out for the life of the
   * process.
   *
   * A framework declares far more extension points than a project uses, and most of the ten
   * shipped have no handler at all. They are emitted on the authentication paths, where this
   * is the difference between four allocations per emission and none.
   */
  readonly #unhandled: Promise<R>;

  constructor(definition: HookDefinition<R>) {
    this.name = definition.name;
    this.#inline = new InlineChain<T, R>(definition.name, definition.fallback as R);
    this.#background = new BackgroundChannel<T>(definition.name);
    this.#unhandled = Promise.resolve(definition.fallback as R);
    hookRegistry.add(this);
  }

  /** How many subscribers this hook has, both kinds counted. */
  handlers(): number {
    return this.#inline.size + this.#background.size;
  }

  /**
   * Subscribes a handler that runs inside the request, and answers it back unchanged.
   *
   * It is endpoint code written elsewhere: same latency, same transaction, same consequence.
   * Answering a refusal stops the chain and the emitter sees it.
   */
  on(handler: HookHandler<T, R>): HookHandler<T, R> {
    return this.#inline.add(handler);
  }

  /**
   * Subscribes a handler that runs later and durably, and answers it back unchanged.
   *
   * There is **no request context** here, so nothing the handler needs may be read from it and
   * the payload has to carry it. A database write in particular will not have the owner
   * filter applied, which is why an account id is in nearly every payload the framework emits.
   */
  background(handler: BackgroundHookHandler<T>): BackgroundHookHandler<T> {
    return this.#background.add(handler);
  }

  /**
   * Emits the event and answers what the inline chain decided.
   *
   * The background work is queued only if nobody refused: a sign-up that was rejected must
   * not send its welcome mail.
   */
  run(payload: T): Promise<R> {
    if (this.handlers() === 0) return this.#unhandled;

    return this.#emit(payload);
  }

  async #emit(payload: T): Promise<R> {
    const decision = await this.#inline.run(payload);

    if (!isRefusal(decision)) await this.#background.enqueue(payload);

    return decision;
  }
}
