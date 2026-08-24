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

import { realtimeGrants } from "./tables.ts";

/**
 * How many accounts one listing answers with.
 *
 * A channel with more listeners than this is one a project addresses by writing its own query,
 * not by pulling every identifier into a process.
 */
const MAX_LISTENERS = 1_000;

/** Lets `accountId` listen to `channel`, and answers whether the grant is now in place. */
export async function grantChannel(channel: string, accountId: string): Promise<boolean> {
  if (await isGranted(channel, accountId)) return true;

  return await realtimeGrants().insert({ channel, account_id: accountId });
}

/** Stops `accountId` from listening to `channel`, and answers whether a grant was removed. */
export async function revokeChannel(channel: string, accountId: string): Promise<boolean> {
  if (!(await isGranted(channel, accountId))) return false;

  return await realtimeGrants()
    .where((f) => [f.channel.eq(channel), f.account_id.eq(accountId)])
    .delete();
}

/**
 * Stops everyone from listening to `channel`, and answers whether the wipe went through.
 *
 * A channel that closes leaves its grants behind otherwise, and they come back the day the
 * name is reused for something else.
 */
export function revokeChannelEntirely(channel: string): Promise<boolean> {
  return realtimeGrants()
    .where((f) => f.channel.eq(channel))
    .delete();
}

/** Whether `accountId` may listen to `channel`. */
export async function isGranted(channel: string, accountId: string): Promise<boolean> {
  const row = await realtimeGrants()
    .selectRaw("account_id")
    .where((f) => [f.channel.eq(channel), f.account_id.eq(accountId)])
    .getOne();

  return row !== null;
}

/**
 * The accounts that may listen to `channel`, up to {@link MAX_LISTENERS}.
 *
 * Reaching the cap is reported, because a truncated listing is indistinguishable from a
 * complete one at the call site and reads as a channel that lost its listeners.
 */
export async function grantedAccounts(channel: string): Promise<string[]> {
  const rows = await realtimeGrants()
    .selectRaw("account_id")
    .where((f) => f.channel.eq(channel))
    .limit(MAX_LISTENERS)
    .get();

  if (rows.length >= MAX_LISTENERS) {
    console.error(
      `[realtime:grants] ${JSON.stringify(channel)} has at least ${MAX_LISTENERS} listeners: the listing is truncated.`,
    );
  }

  return rows.map((row) => String(row.account_id));
}
