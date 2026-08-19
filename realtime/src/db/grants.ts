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
