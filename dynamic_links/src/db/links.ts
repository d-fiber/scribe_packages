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
  });
}

/**
 * Removes the link answering to `slug`, and answers whether a row was removed.
 *
 * The slug rather than the identifier because it is unique too, and because it is what every
 * caller already holds: a link is asked for by the only part of it an address carries.
 */
export async function deleteLink(slug: string): Promise<boolean> {
  return await dynamicLinks()
    .where((f) => f.slug.eq(slug))
    .delete();
}
