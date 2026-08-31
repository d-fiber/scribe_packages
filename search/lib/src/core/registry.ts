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

import type { SearchIndex } from "./search_index.ts";

/** Any declared index, whatever parameters and preview it was declared with. */
// deno-lint-ignore no-explicit-any -- SearchIndex's parameters are constrained (Doc extends object, Params extends SearchParams), which unknown fails outright.
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
