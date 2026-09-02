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

import type { Future } from "@scribe/alchemy";

import { wrote } from "@scribe/foundation/database";
import { realtimeGrants } from "./tables.ts";

/** How many accounts one call to {@link grantedAccounts} answers with at most. */
export const GRANT_PAGE_SIZE = 1_000;

/** One page of the accounts granted on a channel, in account order. */
export interface GrantPage {
  /** The account identifiers on this page. */
  readonly accounts: readonly string[];

  /** The last account identifier the database answered with, or null when it answered none. */
  readonly last: string | null;

  /** Whether the database filled the page, which is what says more accounts may follow. */
  readonly full: boolean;
}

/** Lets `accountId` listen to `channel`, and answers whether the grant is now in place. */
export async function grantChannel(channel: string, accountId: string): Future<boolean> {
  return wrote(
    await realtimeGrants().upsert(
      { channel, account_id: accountId },
      { onConflict: "channel,account_id" },
    ),
  );
}

/** Stops `accountId` from listening to `channel`, and answers whether a grant was removed. */
export async function revokeChannel(channel: string, accountId: string): Future<boolean> {
  if (!(await isGranted(channel, accountId))) return false;

  return wrote(
    await realtimeGrants()
      .where((f) => [f.channel.eq(channel), f.account_id.eq(accountId)])
      .delete(),
  );
}

/**
 * Stops everyone from listening to `channel`, and answers whether the wipe went through.
 *
 * A channel that closes leaves its grants behind otherwise, and they come back the day the
 * name is reused for something else.
 */
export function revokeChannelEntirely(channel: string): Future<boolean> {
  return realtimeGrants()
    .where((f) => f.channel.eq(channel))
    .delete().then(wrote);
}

/** Whether `accountId` may listen to `channel`. */
export async function isGranted(channel: string, accountId: string): Future<boolean> {
  const row = await realtimeGrants()
    .selectRaw("account_id")
    .where((f) => [f.channel.eq(channel), f.account_id.eq(accountId)])
    .getOne();

  return row !== null;
}

/**
 * One page of the accounts that may listen to `channel`, in account order.
 *
 * @param limit - How many accounts one page carries at most.
 * @param after - The account identifier to resume after, exclusive. Empty starts at the
 * beginning.
 */
export async function grantedAccounts(
  channel: string,
  limit: number,
  after = "",
): Future<GrantPage> {
  const rows = await realtimeGrants()
    .selectRaw("account_id")
    .where((f) => after === "" ? f.channel.eq(channel) : [f.channel.eq(channel), f.account_id.gt(after)])
    .order("account_id")
    .limit(limit + 1)
    .get();

  const overfetched = rows.length > limit;
  const accounts = rows.slice(0, limit).map((row) => String(row.account_id));
  return {
    accounts,
    last: accounts.length === 0 ? null : accounts[accounts.length - 1],
    full: overfetched,
  };
}
