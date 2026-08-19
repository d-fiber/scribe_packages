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

import type { Listen } from "./listen.ts";

const declarations = new Map<string, Listen>();

/**
 * Records that `name` was declared, and how open its broadcast is.
 *
 * @remarks
 * Two declarations that pick the same name would share their listeners and their grants
 * without either of them saying so, and the one loaded second would silently decide how open
 * the first one is. It throws rather than letting the process start on that.
 */
export function declareChannel(name: string, listen: Listen): void {
  const already = declarations.get(name);
  if (already !== undefined && already !== listen) {
    throw new TypeError(
      `realtime channel "${name}" is declared twice, once as "${already}" and once as "${listen}".`,
    );
  }

  declarations.set(name, listen);
}

/** Every channel this process declared, with the openness each one asked for. */
export function declaredChannels(): ReadonlyMap<string, Listen> {
  return declarations;
}
