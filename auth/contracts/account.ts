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

import type { RequestIpLocation } from "@scribe/core/contracts/common/location.ts";
import type { RequestDevice } from "@scribe/core/contracts/device.ts";
import type { Channel } from "./channel.ts";

/** One row of the table this package keeps of who exists. */
export interface AccountRow {
  /** The identifier the identity provider issued, which every other table points at. */
  id: string;

  /** The name of the declaration this account belongs to, as it travels in the token. */
  role: string;

  /** The address this account signs in with, null when it came through another channel. */
  email: string | null;

  /** The number this account signs in with, null when it came through another channel. */
  phone: string | null;

  /** Whether the address has been proven, which an invited account is created with. */
  email_verified: boolean;

  /** Whether the number has been proven. */
  phone_verified: boolean;

  /** When the account was written, in milliseconds, set by a trigger. */
  created_at: number;
}

/** One row of the table this package keeps of who is shut out. */
export interface BanRow {
  /** The account this ban applies to. */
  account_id: string;

  /** When the ban was laid, in milliseconds, set by a trigger. */
  since: number;

  /** When it lifts by itself, in milliseconds, null for one that has to be lifted by hand. */
  until: number | null;

  /** Why it was laid, kept for whoever reads it back rather than read by this package. */
  reason: string | null;
}

/** A ban as a caller reads it back. */
export interface Ban {
  /** When the ban was laid, in milliseconds. */
  readonly since: number;

  /** When it lifts by itself, in milliseconds, null when nothing lifts it. */
  readonly until: number | null;

  /** Why it was laid, null when no reason was given. */
  readonly reason: string | null;
}

/** What every account carries, whatever its declaration folds in on top. */
export interface AccountIdentity {
  /** The identifier the identity provider issued. */
  readonly id: string;

  /** The name of the declaration this account belongs to. */
  readonly role: string;

  /** The address this account signs in with, null when it came through another channel. */
  readonly email: string | null;

  /** The number this account signs in with, null when it came through another channel. */
  readonly phone: string | null;

  /** Whether the address has been proven. */
  readonly emailVerified: boolean;

  /** Whether the number has been proven. */
  readonly phoneVerified: boolean;

  /** When the account was written, in milliseconds. */
  readonly createdAt: number;

  /** The ban standing over this account, null when none stands. */
  readonly banned: Ban | null;
}

/** What a declaration's own sign-in condition is handed to make up its mind. */
export interface SignInContext<TAccount> {
  /** The account as `get` answers it, folds included, so a condition reads what the project declared. */
  readonly account: TAccount;

  /** The device the request came from. */
  readonly device: RequestDevice;

  /**
   * Where the address the request came from resolves to.
   *
   * It is handed over rather than left to be asked for because a condition that needs it needs
   * it on every sign-in, and it is already resolved once per request. Both fields are empty
   * strings when the project installed no resolver.
   */
  readonly location: RequestIpLocation;

  /** The door being tried, so one channel can be refused without refusing the others. */
  readonly channel: Channel;
}

/** How long a ban stands, and what it is written down as. */
export interface BanOptions {
  /** How long the ban stands. It has to be lifted by hand when absent. */
  readonly for?: import("@scribe/core/contracts/common/time.ts").Time;

  /** Why it was laid, kept for whoever reads it back. */
  readonly reason?: string;
}
