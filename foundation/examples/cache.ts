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

import { Duration, type Future, type UnmodifiableList } from "@scribe/alchemy";
import { RedisCache } from "../lib/src/cache/redis_cache.ts";

/** What one entry of the session namespace holds. */
interface Session {
  /** The account the session was opened for. */
  readonly accountId: string;

  /** The display name, kept here so a read does not need the users table. */
  readonly name: string;
}

/**
 * One namespace, one type, one lifetime.
 *
 * `key` is the only field a declaration owes. Left out, `ttl` is fifteen days, which is the
 * answer for a namespace whose entries are correct at any age; a namespace whose values go
 * stale says how fast here rather than at each call site.
 */
export const sessions = new RedisCache<Session>({ key: "session", ttl: Duration.minutes(5) });

/** Reads one entry, answering null on a miss and on an unreachable Redis alike. */
export function sessionOf(accountId: string): Future<Session | null> {
  return sessions.get(accountId);
}

/** Reads a whole page of entries in one round trip instead of one per identifier. */
export function sessionsOf(accountIds: UnmodifiableList<string>): Future<(Session | null)[]> {
  return sessions.getMany(accountIds);
}

/** Writes an entry the caller already holds, which costs nothing to produce. */
export function remember(session: Session): Future<void> {
  return sessions.add(session.accountId, session);
}

/**
 * Reads the entry, and produces it from the source when it is missing or stale.
 *
 * This is the call the two grouping stages and the early refresh are for: four concurrent
 * callers of one key cost a single read, and an entry close to its expiry is rebuilt by
 * whoever draws the short straw while the old value keeps being served.
 */
export function sessionOrLoad(accountId: string, load: () => Future<Session>): Future<Session> {
  return sessions.upsert(accountId, load);
}

/** Drops one entry, then a group of them. */
export async function forget(accountId: string, alsoDrop: UnmodifiableList<string>): Future<void> {
  await sessions.delete(accountId);
  await sessions.deleteMany(...alsoDrop);
}

/**
 * Empties the whole namespace, then the part of it a pattern names.
 *
 * The argument is a glob appended to the namespace, not a prefix: `"tenant:*"` clears
 * `session:tenant:*`, and `"tenant"` matches that one key exactly.
 */
export async function evict(): Future<void> {
  await sessions.clear("tenant:*");
  await sessions.clear();
}
