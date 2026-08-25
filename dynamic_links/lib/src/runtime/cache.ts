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

import { cache, Duration } from "@scribe/alchemy";
import type { DynamicLinkRow } from "../db/tables.ts";

/** How long a resolved slug is kept, answered or not. */
const CACHE_TTL = Duration.minutes(10);

/**
 * What one cached slug holds.
 *
 * The row is wrapped rather than cached on its own so that the absence of a link is cached too.
 * A slug nobody ever created is the one an address scanner asks for, and an unwrapped null would
 * send every one of those to Postgres.
 */
interface CachedLink {
  /** The link the slug resolved to, null when no link answers to it. */
  readonly link: DynamicLinkRow | null;
}

const links = cache<CachedLink>({ key: "dynlink:slug", ttl: CACHE_TTL });

/** The link `slug` resolves to, loading it through `load` when the cache does not hold it. */
export async function cachedLink(
  slug: string,
  load: () => Promise<DynamicLinkRow | null>,
): Promise<DynamicLinkRow | null> {
  const cached = await links.upsert(slug, async () => ({ link: await load() }));
  return cached.link;
}

/**
 * Drops what the cache holds for `slug`.
 *
 * Creating a link whose slug had already been asked for needs this, otherwise the slug stays
 * absent for as long as ten minutes after it started answering.
 */
export function forgetLink(slug: string): Promise<void> {
  return links.delete(slug);
}
