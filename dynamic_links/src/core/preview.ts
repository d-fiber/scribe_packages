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
