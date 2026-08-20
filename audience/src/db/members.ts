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

import { type AudienceRow, audiences } from "./tables.ts";

/**
 * How many members one listing answers with.
 *
 * An audience with more members than this is one a project addresses by writing its own query,
 * not by pulling every identifier into a process.
 */
export const MAX_MEMBERS = 1_000;

/**
 * How many audiences one member is listed under.
 *
 * The cap is lower than the one on members because this listing exists to be put in a token, and
 * a token that carries a thousand names is one nothing will send twice.
 */
export const MAX_AUDIENCES = 200;

/** The row held for `member` in `audience`, or null when the table holds none. */
export function membershipOf(audience: string, member: string): Promise<AudienceRow | null> {
  return audiences()
    .where((f) => [f.audience.eq(audience), f.member.eq(member)])
    .getOne();
}

/**
 * Puts `member` in `audience` until `expiresAt`, and answers whether the membership is in place.
 *
 * @remarks
 * It reads before it writes because the query builder has no upsert and an update that matched
 * nothing is indistinguishable from one that matched a row. Two writers putting the same member
 * in at the same instant therefore have one of them refused by the primary key, which answers
 * false rather than dropping the other's expiry.
 */
export async function writeMembership(
  audience: string,
  member: string,
  expiresAt: number | null,
): Promise<boolean> {
  const held = await membershipOf(audience, member);

  if (held === null) {
    return await audiences().insert({ audience, member, expires_at: expiresAt });
  }

  return await audiences()
    .where((f) => [f.audience.eq(audience), f.member.eq(member)])
    .update({ expires_at: expiresAt });
}

/**
 * Moves when `member` is dropped from `audience`, and answers whether a row was there to move.
 *
 * A membership that has already expired counts as absent, so extending one is putting the member
 * back in rather than reviving a row nothing was answering with any more.
 */
export async function retimeMembership(
  audience: string,
  member: string,
  expiresAt: number | null,
): Promise<boolean> {
  const held = await membershipOf(audience, member);
  if (held === null || hasExpired(held)) return false;

  return await audiences()
    .where((f) => [f.audience.eq(audience), f.member.eq(member)])
    .update({ expires_at: expiresAt });
}

/** Takes `member` out of `audience`, and answers whether a row was removed. */
export async function dropMembership(audience: string, member: string): Promise<boolean> {
  const removed = await audiences()
    .where((f) => [f.audience.eq(audience), f.member.eq(member)])
    .deleteOne((s) => ({ member: s.member }));

  return removed !== null;
}

/** Empties `audience`, and answers whether the wipe went through. */
export function dropAudience(audience: string): Promise<boolean> {
  return audiences()
    .where((f) => f.audience.eq(audience))
    .delete();
}

/** Takes `member` out of every audience, and answers whether the wipe went through. */
export function dropMember(member: string): Promise<boolean> {
  return audiences()
    .where((f) => f.member.eq(member))
    .delete();
}

/**
 * The members of `audience` that have not expired, up to {@link MAX_MEMBERS}.
 *
 * Reaching the cap is reported, because a truncated listing is indistinguishable from a complete
 * one at the call site and reads as an audience that lost its members.
 */
export async function membersOf(audience: string): Promise<string[]> {
  const rows = await audiences()
    .select((s) => ({ member: s.member, expires_at: s.expires_at }))
    .where((f) => f.audience.eq(audience))
    .limit(MAX_MEMBERS)
    .get();

  report("members", audience, rows.length, MAX_MEMBERS);

  return rows.filter((row) => !hasExpired(row)).map((row) => row.member);
}

/**
 * The audiences `member` has not expired out of, up to {@link MAX_AUDIENCES}.
 *
 * The keys come back as they are stored, declaration name and scope joined, since that is what a
 * caller compares against and there is nothing here that could take them apart again.
 */
export async function audiencesOfMember(member: string): Promise<string[]> {
  const rows = await audiences()
    .select((s) => ({ audience: s.audience, expires_at: s.expires_at }))
    .where((f) => f.member.eq(member))
    .limit(MAX_AUDIENCES)
    .get();

  report("audiences", member, rows.length, MAX_AUDIENCES);

  return rows.filter((row) => !hasExpired(row)).map((row) => row.audience);
}

/** Whether the membership `row` describes has stopped counting. */
export function hasExpired(row: { expires_at: number | null }): boolean {
  return row.expires_at !== null && row.expires_at <= Date.now();
}

function report(listing: string, key: string, found: number, cap: number): void {
  if (found < cap) return;

  console.error(
    `[audience:${listing}] ${JSON.stringify(key)} reached ${cap} rows: the listing is truncated.`,
  );
}
