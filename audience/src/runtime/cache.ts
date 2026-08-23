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

import { Duration } from "@scribe/alchemy";
import { Valkery } from "@scribe/foundation/lib/src/valkery/valkery.ts";
import type { AudienceRow } from "../db/tables.ts";

/**
 * How long a membership is kept, held or not.
 *
 * It is short by the standards of this cache because what it holds decides whether a caller gets
 * through. Nothing waits on it either: putting a member in, taking one out and emptying an
 * audience all drop what they touched, and the store is shared, so every replica stops answering
 * the old way at the same instant. What the ten minutes cover is the row that expires on its own,
 * which no write goes through to announce.
 */
const CACHE_TTL = Duration.minutes(10);

/**
 * What one cached membership holds.
 *
 * The row is wrapped rather than cached on its own so that the absence of a membership is cached
 * too. Most questions this package answers are asked about somebody who does not belong, and an
 * unwrapped null would send every one of them to Postgres.
 */
interface CachedMembership {
  /** The row in the table, null when the table holds none for that pair. */
  readonly row: AudienceRow | null;
}

const SEPARATOR = "|";

const cache = new Valkery<CachedMembership>({ key: "audience:member", ttl: CACHE_TTL });

/**
 * The row held for `member` in `audience`, loading it through `load` when the cache does not.
 *
 * What comes back is the row as the table holds it, expiry included and not applied: the moment a
 * membership stops counting is judged by the caller, after this, so it is exact instead of being
 * rounded up to whatever is left of the cache entry.
 */
export async function cachedMembership(
  audience: string,
  member: string,
  load: () => Promise<AudienceRow | null>,
): Promise<AudienceRow | null> {
  const held = await cache.upsert(entryOf(audience, member), async () => ({ row: await load() }));
  return held.row;
}

/** Drops what the cache holds for `member` in `audience`, so the next read goes to the table. */
export function forgetMembership(audience: string, member: string): Promise<void> {
  return cache.delete(entryOf(audience, member));
}

/** Drops what the cache holds for every member of `audience`. */
export function forgetAudience(audience: string): Promise<void> {
  return cache.clear(`${audience}${SEPARATOR}*`);
}

/**
 * Drops what the cache holds for `member` in each of `audiences`.
 *
 * The audiences are named rather than swept because a sweep matching a member would have to glob
 * on the tail of every key of the namespace, and Redis walks the whole keyspace to answer that.
 */
export function forgetMemberIn(audiences: readonly string[], member: string): Promise<void> {
  if (audiences.length === 0) return Promise.resolve();

  return cache.deleteMany(...audiences.map((audience) => entryOf(audience, member)));
}

function entryOf(audience: string, member: string): string {
  return `${audience}${SEPARATOR}${member}`;
}
