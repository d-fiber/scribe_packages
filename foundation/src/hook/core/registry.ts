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
