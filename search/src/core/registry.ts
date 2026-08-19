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

import type { SearchIndex } from "./search_index.ts";

/** Any declared index, whatever parameters and preview it was declared with. */
// deno-lint-ignore no-explicit-any
export type AnySearchIndex = SearchIndex<any, any>;

const declarations = new Map<string, AnySearchIndex>();

/**
 * Records that `index` was declared, so the drain can find it by the name the outbox carries.
 *
 * @throws {TypeError} When two declarations take the same name, or write into the same index
 * of the cluster. Either one would leave both declarations mapping and rebuilding the other's
 * documents, and the one loaded second would decide what the mapping says.
 */
export function declareIndex(index: AnySearchIndex): void {
  const named = declarations.get(index.name);
  if (named !== undefined && named !== index) {
    throw new TypeError(`search index "${index.name}" is declared twice, on "${named.table}" and on "${index.table}".`);
  }

  for (const already of declarations.values()) {
    if (already !== index && already.index === index.index) {
      throw new TypeError(
        `search indices "${already.name}" and "${index.name}" both write into "${index.index}".`,
      );
    }
  }

  declarations.set(index.name, index);
}

/** Every index this process declared. */
export function declaredIndices(): readonly AnySearchIndex[] {
  return [...declarations.values()];
}

/** The index declared as `name`, or null when nothing answers to it. */
export function indexNamed(name: string): AnySearchIndex | null {
  return declarations.get(name) ?? null;
}
