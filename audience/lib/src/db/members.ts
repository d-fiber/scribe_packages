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

import { wrote } from "@scribe/foundation/database";
import { type AudienceRow, audiences } from "./tables.ts";

const CONFLICT_KEY = "feature,audience,member";

/**
 * How many rows one upsert call carries.
 *
 * A caller does not know which of a bulk write's members already exist, so every write goes
 * through here rather than splitting into an insert and an update. The chunk size is a property
 * of the backend, not of the caller enqueuing a mailing list: it stays here, next to the query
 * that pays for it, so a backend swap changes one number in one place.
 */
const BULK_CHUNK_SIZE = 1_000;

/**
 * How many members one page answers with, and one raw fetch asks for at a time, when a caller
 * does not say.
 */
export const DEFAULT_PAGE_SIZE = 1_000;

/** How many audiences {@link audiencesOfMember} answers with when a caller does not say. */
export const DEFAULT_AUDIENCES_LIMIT = 200;

/**
 * How many raw rows {@link membersOf} is willing to read past `limit` while filtering out expired
 * ones, before it gives up and reports the page truncated.
 *
 * Filtering happens after the read, not in the query: excluding an expired row needs `expires_at
 * is null or expires_at > now`, and the query builder only ever ANDs conditions together. Reading
 * an unbounded number of expired rows to answer one page would be its own way of hurting an
 * unrelated caller, so the scan stops at ten pages' worth and says so, instead of either lying
 * about `truncated` or running forever against an audience nobody reaped.
 */
const SCAN_MULTIPLIER = 10;

/** One membership to write, as {@link writeMembership} and {@link writeMemberships} take it. */
export interface MembershipWrite {
  /** The feature this write's audience belongs to. */
  readonly feature: string;

  /** The audience's key, name and scope already joined. */
  readonly audience: string;

  /** The member being put in. */
  readonly member: string;

  /** When the membership drops, in milliseconds, or null for one that never expires. */
  readonly expiresAt: number | null;
}

/** One page of a listing, and whether the scan gave up before it could say the listing was complete. */
export interface MembersPage {
  /** The members this page holds, in ascending order. */
  readonly members: string[];

  /** The value to pass as `after` to read the next page, or null once nothing more follows. */
  readonly cursor: string | null;

  /**
   * Whether the scan stopped before it could tell whether more live members follow.
   *
   * A caller that treats this as "there might be more" is always safe. A caller that ignores it is
   * exactly the failure the original, unpaginated cap produced: a truncated page nobody could tell
   * apart from a complete one.
   */
  readonly truncated: boolean;
}

/** The row held for `member` in `feature`'s `audience`, or null when the table holds none. */
export function membershipOf(feature: string, audience: string, member: string): Promise<AudienceRow | null> {
  return audiences()
    .where((f) => [f.feature.eq(feature), f.audience.eq(audience), f.member.eq(member)])
    .getOne();
}

/** Puts `member` in `audience` until `expiresAt`, and answers whether the write went through. */
export async function writeMembership(write: MembershipWrite): Promise<boolean> {
  return wrote(
    await audiences().upsert(
      { feature: write.feature, audience: write.audience, member: write.member, expires_at: write.expiresAt },
      { onConflict: CONFLICT_KEY },
    ),
  );
}

/**
 * Puts every one of `writes` in, chunked into calls of {@link BULK_CHUNK_SIZE}, and answers
 * whether every chunk went through.
 *
 * @remarks
 * This is what turns adding twenty thousand members into a handful of round trips instead of
 * twenty thousand: each chunk is one upsert, so a member already in the audience is updated and
 * one that is not is inserted, in the same call. Chunks are sent one after another rather than
 * together, which is what keeps one bulk write from opening thousands of connections at once.
 */
export async function writeMemberships(writes: readonly MembershipWrite[]): Promise<boolean> {
  if (writes.length === 0) return true;

  for (const chunk of _chunksOf(writes, BULK_CHUNK_SIZE)) {
    const rows = chunk.map((write) => ({
      feature: write.feature,
      audience: write.audience,
      member: write.member,
      expires_at: write.expiresAt,
    }));

    if (!wrote(await audiences().upsert(rows, { onConflict: CONFLICT_KEY }))) return false;
  }

  return true;
}

/**
 * Moves when `member` is dropped from `feature`'s `audience`, and answers whether a row was there
 * to move.
 *
 * A membership that has already expired counts as absent, so extending one is putting the member
 * back in rather than reviving a row nothing was answering with any more. This stays a read then a
 * targeted update rather than an upsert: an upsert would create the very membership this call is
 * meant to refuse when none exists.
 */
export async function retimeMembership(
  feature: string,
  audience: string,
  member: string,
  expiresAt: number | null,
): Promise<boolean> {
  const held = await membershipOf(feature, audience, member);
  if (held === null || hasExpired(held)) return false;

  return wrote(
    await audiences()
      .where((f) => [f.feature.eq(feature), f.audience.eq(audience), f.member.eq(member)])
      .update({ expires_at: expiresAt }),
  );
}

/** Takes `member` out of `feature`'s `audience`, and answers whether a row was removed. */
export async function dropMembership(feature: string, audience: string, member: string): Promise<boolean> {
  const removed = await audiences()
    .where((f) => [f.feature.eq(feature), f.audience.eq(audience), f.member.eq(member)])
    .deleteOne((s) => ({ member: s.member }));

  return removed.ok;
}

/** Empties `feature`'s `audience`, and answers whether the wipe went through. */
export function dropAudience(feature: string, audience: string): Promise<boolean> {
  return audiences()
    .where((f) => [f.feature.eq(feature), f.audience.eq(audience)])
    .delete().then(wrote);
}

/** Takes `member` out of every audience of every feature, and answers whether the wipe went through. */
export function dropMember(member: string): Promise<boolean> {
  return audiences()
    .where((f) => f.member.eq(member))
    .delete().then(wrote);
}

/**
 * The live members of `feature`'s `audience`, one page at a time.
 *
 * @remarks
 * It reads raw pages ordered by `member` and filters expired rows out of each one, advancing the
 * cursor past every row it read whether or not that row was live. A page that came back short of
 * `options.limit` therefore means the scan reached the true end of the audience, not that it gave
 * up: the two used to be indistinguishable, which is the defect this replaces. `options.limit`
 * bounds how many **live** members come back, never how many raw rows are read to find them.
 */
export async function membersOf(
  feature: string,
  audience: string,
  options: { after?: string; limit?: number } = {},
): Promise<MembersPage> {
  const limit = options.limit ?? DEFAULT_PAGE_SIZE;
  const scanCap = limit * SCAN_MULTIPLIER;

  const collected: string[] = [];
  let cursor = options.after ?? null;
  let scanned = 0;

  while (collected.length < limit) {
    const rows = await _rawPage(feature, audience, cursor, limit);
    if (rows.length === 0) return { members: collected, cursor: null, truncated: false };

    for (const row of rows) {
      cursor = row.member;
      if (!hasExpired(row)) collected.push(row.member);
      if (collected.length >= limit) break;
    }
    scanned += rows.length;

    if (rows.length < limit) return { members: collected, cursor: null, truncated: false };
    if (scanned >= scanCap) return { members: collected, cursor, truncated: true };
  }

  return { members: collected, cursor, truncated: false };
}

/** One raw page of `feature`'s `audience`, ordered by `member`, unfiltered by expiry. */
function _rawPage(feature: string, audience: string, after: string | null, limit: number): Promise<AudienceRow[]> {
  const query = audiences()
    .select((s) => ({ member: s.member, expires_at: s.expires_at }))
    .where((f) => after === null ? [f.feature.eq(feature), f.audience.eq(audience)] : [
      f.feature.eq(feature),
      f.audience.eq(audience),
      f.member.gt(after),
    ])
    .order("member")
    .limit(limit);

  // deno-lint-ignore no-explicit-any -- select() narrows the answer to the two projected columns, which is what a raw page needs.
  return query.get() as Promise<any>;
}

/**
 * The audiences, across every feature, that `member` has not expired out of, up to `limit`.
 *
 * @remarks
 * It reads a window of `limit` times {@link SCAN_MULTIPLIER} raw rows and filters expired ones out
 * of that window, rather than filtering after a `limit`-sized read: the same defect `membersOf`
 * closes applies here too, an audience the caller has actually not expired out of must not read as
 * absent just because an expired row for a different audience sorted ahead of it. There is no
 * cursor because nothing today asks for a second page of somebody's own memberships.
 */
export async function audiencesOfMember(
  member: string,
  limit: number = DEFAULT_AUDIENCES_LIMIT,
): Promise<{ audiences: string[]; truncated: boolean }> {
  const scanCap = limit * SCAN_MULTIPLIER;

  const rows = await audiences()
    .select((s) => ({ feature: s.feature, audience: s.audience, expires_at: s.expires_at }))
    .where((f) => f.member.eq(member))
    .order("audience")
    .limit(scanCap)
    .get();

  const live = rows.filter((row) => !hasExpired(row)).map((row) => row.audience);
  return { audiences: live.slice(0, limit), truncated: rows.length >= scanCap && live.length > limit };
}

/**
 * Physically removes every row of `feature`'s `audience` that has already expired, and answers
 * how many were removed.
 *
 * @remarks
 * `expires_at <= now` never matches a row whose `expires_at` is null, by ordinary SQL null
 * comparison, so this needs no separate check for a membership that never expires. It removes the
 * whole backlog of one audience in a single statement, since the query builder has no way to bound
 * a delete by row count: a project reaping a very large backlog should call this often enough that
 * the backlog stays small, rather than expect one call to chunk itself.
 */
export async function reapExpired(feature: string, audience: string): Promise<number> {
  const removed = await audiences()
    .where((f) => [f.feature.eq(feature), f.audience.eq(audience), f.expires_at.lte(Date.now())])
    .delete();

  return removed.ok ? removed.data : 0;
}

/** Whether the membership `row` describes has stopped counting. */
export function hasExpired(row: { expires_at: number | null }): boolean {
  return row.expires_at !== null && row.expires_at <= Date.now();
}

/** `items`, split into arrays of at most `size`. */
function* _chunksOf<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let at = 0; at < items.length; at += size) yield items.slice(at, at + size);
}
