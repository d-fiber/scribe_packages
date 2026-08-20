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

import { Table } from "@scribe/foundation/src/database/table.ts";
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
