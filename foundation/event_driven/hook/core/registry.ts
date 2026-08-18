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

export interface RegisteredHook {
  readonly name: string;
  handlers(): number;
  run(payload: never): Promise<unknown>;
}

export class HookRegistry {
  readonly #hooks = new Map<string, RegisteredHook>();

  add(hook: RegisteredHook): void {
    const existing = this.#hooks.get(hook.name);
    if (existing && existing !== hook) {
      throw new Error(
        `defineHook("${hook.name}"): this name is already declared. ` +
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

export const hookRegistry: HookRegistry = new HookRegistry();
