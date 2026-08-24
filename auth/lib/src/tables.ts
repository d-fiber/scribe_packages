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

import { Table } from "@scribe/foundation/lib/src/database/table.ts";
import type { AccountRow, BanRow } from "../contracts/account.ts";
import type { AccountDevice } from "../contracts/device.ts";

/** One row of the table this package keeps of the devices an account signs in from. */
export interface DeviceRow extends AccountDevice {
  /** The account this device belongs to. */
  account_id: string;

  /** A digest of what the client reported about itself, used to notice a device that changed. */
  hash: string | null;
}

/** One row of the table this package keeps of the tokens it has minted and not yet spent. */
export interface PendingTokenRow {
  /** The digest of the token, which is all that is written down: the token itself never is. */
  token_hash: string;

  /** When the token stops being worth anything, in milliseconds. */
  expires_at: number;
}

/**
 * The four tables this package ships, as the query builder needs to see them.
 *
 * They are declared here rather than taken from a generated schema because the package owns the
 * SQL that creates them. A package that read its own tables out of a project's generated file
 * would stop compiling the day that project renamed something it does not own.
 */
export type AuthSchema = {
  /** One row per account, whatever declaration it belongs to. */
  __accounts__: { row: AccountRow };

  /** One row per device an account has signed in from. */
  __account_devices__: { row: DeviceRow };

  /** One row per ban standing, and none for an account nobody shut out. */
  __account_bans__: { row: BanRow };

  /** One row per token minted and not yet spent, expired ones included until they are swept. */
  __pending_tokens__: { row: PendingTokenRow };
};

/** A handle on one of this package's own tables. */
export class AuthTable<K extends keyof AuthSchema & string> extends Table<AuthSchema, K> {}

/** Who exists. */
export function accounts(): AuthTable<"__accounts__"> {
  return new AuthTable("__accounts__");
}

/** Where an account signs in from. */
export function accountDevices(): AuthTable<"__account_devices__"> {
  return new AuthTable("__account_devices__");
}

/** Who is shut out. */
export function accountBans(): AuthTable<"__account_bans__"> {
  return new AuthTable("__account_bans__");
}

/** What has been minted and not yet spent. */
export function pendingTokens(): AuthTable<"__pending_tokens__"> {
  return new AuthTable("__pending_tokens__");
}
