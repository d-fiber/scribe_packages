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

import { wrote } from "@scribe/foundation/lib/foundation.ts";
import { type DynamicLinkRow, dynamicLinks, type StoredPayload } from "./tables.ts";

/** What creating one link writes into the table. */
export interface NewLink {
  /** The slug drawn for this link. */
  readonly slug: string;

  /** The declaration and its parameters. */
  readonly payload: StoredPayload;

  /** When the link stops resolving, in milliseconds, null for a link that never expires. */
  readonly expiresAt: number | null;

  /** The account creating the link, null for a link no account owns. */
  readonly userId: string | null;
}

/** The link answering to `slug`, or null when the table holds none. */
export function linkBySlug(slug: string): Promise<DynamicLinkRow | null> {
  return dynamicLinks()
    .where((f) => f.slug.eq(slug))
    .getOne();
}

/**
 * Writes `link` and answers the row, or null when the table refused it.
 *
 * A refusal is almost always the unique index on the slug, which is the one the caller retries
 * on. Nothing else in the row can collide.
 */
export function insertLink(link: NewLink): Promise<DynamicLinkRow | null> {
  return dynamicLinks().insertOne({
    slug: link.slug,
    payload: link.payload,
    expires_at: link.expiresAt,
    user_id: link.userId,
  }).then((written) => (written.ok ? written.data : null));
}

/**
 * Removes the link answering to `slug`, and answers whether a row was removed.
 *
 * The slug rather than the identifier because it is unique too, and because it is what every
 * caller already holds: a link is asked for by the only part of it an address carries.
 */
export async function deleteLink(slug: string): Promise<boolean> {
  return wrote(
    await dynamicLinks()
      .where((f) => f.slug.eq(slug))
      .delete(),
  );
}
