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
import { Audience, audiencesOf } from "@scribe/audience";

/**
 * Every audience below belongs to the `chat` feature, which is what keeps its rows, and its cache
 * entries, apart from an unrelated feature's — `buyer-groups` or `notifications`, say — even
 * though they all share the same table.
 */
const chat = Audience.for("chat");

/**
 * A named set with one membership list for the whole process.
 *
 * There is no scope to name, so the members are asked for directly.
 */
export const banned = chat.global("banned");

/**
 * A named set with one membership list per scope.
 *
 * `in` is what picks the list, and the scope is whatever the project keys the right on: a
 * project, a tenant, a document.
 */
export const editors = chat.namespaced("project-editors");

/**
 * A set whose memberships expire on their own.
 *
 * Naming the lifetime on the declaration is what makes a right nobody remembers to take back
 * impossible: every caller inherits it, and a caller that wants otherwise says so per member.
 */
export const invited = chat.namespaced("project-invited", { ttl: Duration.days(7) });

/** Whether an account is in the global set. */
export function isBanned(accountId: string): Promise<boolean> {
  return banned.has(accountId);
}

/** Whether it is in the list one scope holds. */
export function edits(projectId: string, accountId: string): Promise<boolean> {
  return editors.in(projectId).has(accountId);
}

/** A scope may be nested, which keys the list on the whole path rather than on the first part. */
export function editsBackend(projectId: string, accountId: string): Promise<boolean> {
  return editors.in(projectId, "backend").has(accountId);
}

/** Puts a member in for the lifetime the declaration names. */
export async function invite(projectId: string, accountId: string): Promise<boolean> {
  const result = await invited.in(projectId).add(accountId);
  return result.ok;
}

/**
 * Puts a whole mailing list in at once, in a handful of round trips rather than one per address.
 *
 * This is the shape a large, one-shot audience takes: building a twenty-thousand-member list one
 * `add` at a time would pay a read and a write per member, where this pays a few.
 */
export async function inviteAll(projectId: string, accountIds: readonly string[]): Promise<boolean> {
  const result = await invited.in(projectId).addMany(accountIds);
  return result.ok;
}

/**
 * Puts one in for good, past what the declaration says.
 *
 * Null and absent are two answers on purpose: absent means the declaration decides, and null
 * means this member stays.
 */
export async function inviteForGood(projectId: string, accountId: string): Promise<boolean> {
  const result = await invited.in(projectId).add(accountId, { ttl: null });
  return result.ok;
}

/** Pushes one membership out without writing it again. */
export async function renew(projectId: string, accountId: string): Promise<boolean> {
  const result = await invited.in(projectId).ttl(accountId, Duration.days(7));
  return result.ok;
}

/** Takes one member out, then empties the whole list. */
export async function close(projectId: string, accountId: string): Promise<boolean> {
  await invited.in(projectId).remove(accountId);
  const cleared = await invited.in(projectId).clear();
  return cleared.ok;
}

/**
 * Who is in one list, one page at a time.
 *
 * A caller that needs every member of a list too large for one page reads again with `after` set
 * to the cursor the previous page answered, until `cursor` comes back null.
 */
export function invitees(projectId: string): Promise<{ members: string[]; cursor: string | null; truncated: boolean }> {
  return invited.in(projectId).members();
}

/** Which of the declared sets one account belongs to, asked once instead of set by set. */
export function setsOf(accountId: string): Promise<{ audiences: string[]; truncated: boolean }> {
  return audiencesOf(accountId);
}
