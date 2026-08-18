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

import { buildScope, type RealtimeEvent } from "./event.ts";
import { actionName, entityName } from "./name.ts";
import { REALTIME_SCOPES, type RealtimeScope } from "./scope.ts";

export type RealtimeAction =
  | "insert"
  | "update"
  | "delete"
  | (string & NonNullable<unknown>);

export interface EventSpec<S extends RealtimeScope | undefined = undefined> {
  readonly action: string;
  readonly scopes?: readonly Exclude<S, undefined>[];
}

export type EventSpecs = {
  readonly [name: string]: EventSpec<RealtimeScope | undefined>;
};

export function event(action: RealtimeAction): EventSpec<undefined>;
export function event<S extends RealtimeScope>(
  action: RealtimeAction,
  options: { readonly scopes: readonly S[] },
): EventSpec<S>;
export function event<S extends RealtimeScope>(
  action: RealtimeAction,
  options?: { readonly scopes: readonly S[] },
): EventSpec<S | undefined> {
  return { action, scopes: options?.scopes };
}

export type RealtimeEventOf<E, D extends RealtimeScope> =
  E extends EventSpec<infer S>
    ? [S] extends [undefined]
      ? Pick<RealtimeEvent, D>
      : Pick<RealtimeEvent, Extract<S, RealtimeScope>>
    : never;

export type RealtimeEntity<E extends EventSpecs, D extends RealtimeScope> = {
  readonly [K in keyof E]: RealtimeEventOf<E[K], D>;
};

export interface RealtimeDefinition<
  E extends EventSpecs,
  D extends RealtimeScope,
> {
  readonly entity: string;
  readonly scopes?: readonly D[];
  readonly events: E;
}

export function defineRealtime<
  E extends EventSpecs,
  D extends RealtimeScope = RealtimeScope,
>(definition: RealtimeDefinition<E, D>): RealtimeEntity<E, D> {
  const entity = entityName(definition.entity);
  const fallback: readonly RealtimeScope[] = definition.scopes?.length
    ? definition.scopes
    : REALTIME_SCOPES;

  const built: Record<string, unknown> = {};

  for (const [name, spec] of Object.entries(definition.events)) {
    const action = actionName(spec.action);
    const declared = spec.scopes?.length ? spec.scopes : fallback;

    const restricted: Partial<Record<RealtimeScope, unknown>> = {};
    for (const scope of declared) {
      restricted[scope] = buildScope(scope, entity, action);
    }

    built[name] = Object.freeze(restricted);
  }

  return built as RealtimeEntity<E, D>;
}
