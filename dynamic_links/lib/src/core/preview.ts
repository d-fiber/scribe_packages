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

import type { LinkPreview } from "../../contracts/link.ts";

/** The link a preview is asked about, as the rule reading it sees it. */
export interface PreviewedLink {
  /** The name of the declaration the visited row carries. */
  readonly name: string;

  /** The data the link was created with, as it was stored. */
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * What a project answers when a robot unfurls one of its links.
 *
 * `locale` is the first language the visitor announced, null when it announced none. Answering
 * null leaves the link without a card, which is what an address with nothing to show wants.
 */
export type LinkPreviewRule = (link: PreviewedLink, locale: string | null) => LinkPreview | null;

let rule: LinkPreviewRule | null = null;

/**
 * Declares what every link of this process shows when it is unfurled.
 *
 * ```ts
 * onLinkPreview((link, locale) => ({
 *   title: translate(locale, `links.${link.name}.title`, link.data),
 * }));
 * ```
 *
 * A card is written here rather than on a declaration because it is read in the language of
 * whoever opens the link, which nobody knows when the link is declared or created. Passing null
 * takes the rule back out, which is what a test does between two cases.
 */
export function onLinkPreview(next: LinkPreviewRule | null): void {
  rule = next;
}

/** What the declared rule shows for `link`, null when no rule was declared or it showed nothing. */
export function previewOf(link: PreviewedLink, locale: string | null): LinkPreview | null {
  return rule === null ? null : rule(link, locale);
}
