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
