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

import type { AnyLinkData, DynamicLink } from "./declaration.ts";

/** Any declared link, whatever data it was declared with. */
export type AnyDynamicLink = DynamicLink<AnyLinkData>;

const declarations = new Map<string, AnyDynamicLink>();

/**
 * Records that `link` was declared, so a resolved row can find the declaration it names.
 *
 * @throws {TypeError} When two declarations take the same name. The name is what a row carries,
 * so the second declaration would answer for links the first one wrote, with a template that
 * has no reason to render them.
 */
export function declareLink(link: AnyDynamicLink): void {
  const named = declarations.get(link.name);
  if (named !== undefined && named !== link) {
    throw new TypeError(
      `dynamic link "${link.name}" is declared twice, on "${named.pattern}" and on "${link.pattern}".`,
    );
  }

  declarations.set(link.name, link);
}

/** The link declared as `name`, or null when this process has loaded no such declaration. */
export function linkNamed(name: string): AnyDynamicLink | null {
  return declarations.get(name) ?? null;
}

/** Every link this process declared. */
export function declaredLinks(): readonly AnyDynamicLink[] {
  return [...declarations.values()];
}
