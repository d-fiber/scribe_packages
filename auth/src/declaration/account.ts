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

import type { IpLocation } from "@scribe/alchemy/route";
import type { RequestDevice } from "@scribe/core/contracts/device.ts";
import { Failure, okay, type Result } from "@scribe/alchemy";
import { Table } from "@scribe/foundation/lib/src/database/table.ts";
import type { AccountIdentity, AccountRow, SignInContext } from "../../contracts/account.ts";
import type { Channel } from "../../contracts/channel.ts";
import type { AccountDevice } from "../../contracts/device.ts";
import { banOf, Bans } from "../bans.ts";
import { devices } from "../devices/devices.ts";
import { type AccountIdentifier, accountIdentifier } from "../identifier.ts";
import { AccountRoleResolver } from "../identity.ts";
import { type AccountPassword, accountPassword } from "../password.ts";
import { ResetPassword } from "../reset_password.ts";
import { type AccountSession, session } from "../session.ts";
import { type SignInSurface, signInSurface } from "../sign_in/surface.ts";
import { type SignUpSurface, signUpSurface } from "../sign_up/surface.ts";
import { accounts } from "../tables.ts";
import { compileRead, isFilled, isWritten, readSelector, type OptionalValue, type ReadOf, type ReadSelector, type ReadShape, type RequiredValue, type WriteOf, type WriteSelector, type WriteShape, writeSelector } from "./columns.ts";
import { declareAccount } from "./registry.ts";

/**
 * The column by which a project's table names the account it belongs to.
 *
 * A table folded into a read is found by its foreign key, which PostgREST resolves on its own, but
 * a row written at sign-up has to name the account itself. Fixing the column here is what keeps
 * that out of the declaration: a project writes the foreign key it was going to write anyway.
 */
export const ACCOUNT_FOREIGN_KEY = "account_id";

const IDENTITY_SELECT = [
  "id",
  "role",
  "email",
  "phone",
  "emailVerified:email_verified",
  "phoneVerified:phone_verified",
  "createdAt:created_at",
  "banned:__account_bans__(since,until,reason)",
].join(",");

type LooseSchema = Record<string, { row: Record<string, unknown> }>;

class ProjectTable extends Table<LooseSchema, string> {}

/** What declaring an account role takes beyond the name its tokens carry. */
export interface AccountOptions<
  TChannels extends readonly Channel[],
  TGet extends ReadShape,
  TSignUp extends WriteShape,
  TRefusal,
> {
  /** The doors an account of this role may come through, picked from what the engine offers. */
  readonly channels: TChannels;

  /**
   * Whether an account of this role serves without proving the address or the number it gave.
   *
   * False by default, which is what a role people sign themselves up for wants: a link or a code
   * goes out and the account answers nothing until one of them comes back. True is for a role
   * somebody already inside creates, where there is nobody to send a proof to who is not already
   * reachable by whoever typed the address.
   */
  readonly autoConfirm?: boolean;

  /** The rows a sign-up writes, and which of their columns the caller has to fill. */
  readonly signUp: (s: WriteSelector<AccountRow>) => TSignUp;

  /** The tables a read folds in, and what it projects out of each. */
  readonly get: (s: ReadSelector<AccountRow>) => TGet;

  /**
   * The condition this role adds before a session is issued, beyond holding the credentials.
   *
   * It runs once the credentials have checked out and before a session exists, so it reads a real
   * account and a refusal never tells a stranger whether an address is in use. It does not run on
   * a refresh: a session already issued lives out its token, and revoking is what shortens it.
   */
  readonly signIn?: (
    context: SignInContext<AccountIdentity & ReadOf<TGet>>,
  ) => Promise<Result<void, TRefusal>> | Result<void, TRefusal>;
}

/** Why the engine turned a sign-in away before the role's own condition was asked. */
export enum SignInRefusal {
  /** A ban stands over this account. */
  Banned = "banned",
}

/**
 * The devices of the accounts of one role, and what a route is allowed to do to them.
 *
 * Every call checks that the account holds this role before answering, because the devices of
 * every role share one table: without the check, a route holding an administrator's declaration
 * could list and throw out the devices of anybody whose identifier it happened to know.
 */
export class RoleDevices {
  readonly #role: string;

  constructor(role: string) {
    this.#role = role;
  }

  /** Every device this account signs in from, or an empty list when it holds another role. */
  async of(accountId: string): Promise<AccountDevice[]> {
    return (await this.#holds(accountId)) ? await devices.of(accountId) : [];
  }

  /** One device of this account, or null when it holds another role or never used that device. */
  async get(
    accountId: string,
    deviceId: string,
  ): Promise<AccountDevice | null> {
    return (await this.#holds(accountId)) ? await devices.get(accountId, deviceId) : null;
  }

  /** Throws one device out, along with every session it holds. */
  async kick(accountId: string, deviceId: string): Promise<boolean> {
    return (await this.#holds(accountId)) ? await devices.kick(accountId, deviceId) : false;
  }

  /** Throws every device of this account out. */
  async kickAll(accountId: string): Promise<void> {
    if (await this.#holds(accountId)) await devices.kickAll(accountId);
  }

  /** Whether the account `id` names holds this role. */
  #holds(accountId: string): Promise<boolean> {
    return AccountRoleResolver.holds(accountId, this.#role);
  }
}

/** Any declared role, whatever it reads, writes and refuses. */
// deno-lint-ignore no-explicit-any
export type AnyAccount = AccountDeclaration<any, any, any, any>;

function filledColumns(
  fields: WriteShape,
  given: Record<string, unknown>,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  for (const [name, field] of Object.entries(fields)) {
    if (!isFilled(field)) continue;

    const value = given[name];
    if (value === undefined) continue;

    row[(field as RequiredValue<unknown> | OptionalValue<unknown>).column] = value;
  }

  return row;
}

/**
 * One role an account can hold, and the only thing a project declares to obtain one.
 *
 * A role is built, not extended: there is nothing to subclass and nothing to override, which is
 * what keeps every role of the fleet read, written and refused the same way.
 */
export class AccountDeclaration<
  TChannels extends readonly Channel[],
  TGet extends ReadShape,
  TSignUp extends WriteShape,
  TRefusal,
> {
  readonly #options: AccountOptions<TChannels, TGet, TSignUp, TRefusal>;
  readonly #select: string;
  readonly #rows: readonly {
    readonly key: string;
    readonly table: string;
    readonly fields: WriteShape;
  }[];

  /** The devices the accounts of this role sign in from. */
  readonly devices: RoleDevices;

  /** Who is shut out, among the accounts of this role. */
  readonly bans: Bans;

  /** The doors this role may be created through, which are the ones it declared. */
  readonly signUp: SignUpSurface<TChannels, TSignUp>;

  /** The doors this role may sign in through, which are the ones it declared. */
  readonly signIn: SignInSurface<TChannels, TRefusal | SignInRefusal>;

  /** Setting a new password without holding the old one, for the accounts of this role. */
  readonly resetPassword: ResetPassword;

  /** A session once it exists: renewing it, giving it up, and giving up the account with it. */
  readonly session: AccountSession = session;

  /** The password of an account, changed by whoever can produce the current one. */
  readonly password: AccountPassword = accountPassword;

  /** The address and the number an account signs in with. */
  readonly identifier: AccountIdentifier = accountIdentifier;

  private constructor(
    /** The name this role is declared under, which is what a token carries and a registry answers to. */
    readonly name: string,
    options: AccountOptions<TChannels, TGet, TSignUp, TRefusal>,
  ) {
    this.#options = options;
    this.devices = new RoleDevices(name);
    this.bans = new Bans((id) => AccountRoleResolver.holds(id, name));
    this.signUp = signUpSurface(this, options.channels);
    this.signIn = signInSurface(this, options.channels);
    this.resetPassword = new ResetPassword(name);

    const read = compileRead(options.get(readSelector<AccountRow>()));
    this.#select = read.length === 0 ? IDENTITY_SELECT : `${IDENTITY_SELECT},${read}`;

    this.#rows = Object.entries(options.signUp(writeSelector<AccountRow>()))
      .filter(([, value]) => isWritten(value))
      .map(([key, value]) => {
        const written = value as { table: string; fields: WriteShape };
        return { key, table: written.table, fields: written.fields };
      });
  }

  /** Declares a role under `name`, and registers it so a token carrying that name finds it. */
  static declare<
    const TChannels extends readonly Channel[],
    TGet extends ReadShape,
    TSignUp extends WriteShape,
    TRefusal = never,
  >(
    name: string,
    options: AccountOptions<TChannels, TGet, TSignUp, TRefusal>,
  ): AccountDeclaration<TChannels, TGet, TSignUp, TRefusal> {
    const declared = new AccountDeclaration(name, options);
    declareAccount(declared);
    return declared;
  }

  /** The doors an account of this role may come through. */
  get channels(): TChannels {
    return this.#options.channels;
  }

  /** Whether an account of this role serves without proving what it signed up with. */
  get autoConfirm(): boolean {
    return this.#options.autoConfirm ?? false;
  }

  /**
   * The account, with everything this role folds in, or null when no account of this role has
   * that identifier.
   */
  async get(id: string): Promise<(AccountIdentity & ReadOf<TGet>) | null> {
    const row = await accounts()
      .unscoped()
      .selectRaw<Record<string, unknown>>(this.#select)
      .where((f) => [f.id.eq(id), f.role.eq(this.name)])
      .getOne();

    if (row === null) return null;

    return { ...row, banned: banOf(row.banned) } as
      & AccountIdentity
      & ReadOf<TGet>;
  }

  /**
   * Writes the account and every row this role declares, and undoes them all if one fails.
   *
   * This is the half of a sign-up the declaration decides. The identity provider has already
   * issued `id` by the time it runs, which is why the caller passes it rather than this deciding
   * it: an account row that named an identifier nothing was issued for would answer to no token.
   */
  async create(
    input: WriteOf<TSignUp>,
    identity: {
      /** The identifier the identity provider issued. */
      readonly id: string;

      /** The address this account signs in with, when it came through that channel. */
      readonly email?: string | null;

      /** The number this account signs in with, when it came through that channel. */
      readonly phone?: string | null;

      /** Whether the address is already proven, which an invited account is written with. */
      readonly emailVerified?: boolean;

      /** Whether the number is already proven. */
      readonly phoneVerified?: boolean;
    },
  ): Promise<boolean> {
    const written = await accounts().insert({
      id: identity.id,
      role: this.name,
      email: identity.email ?? null,
      phone: identity.phone ?? null,
      email_verified: identity.emailVerified ?? false,
      phone_verified: identity.phoneVerified ?? false,
    });
    if (!written) return false;

    const given = input as Record<string, Record<string, unknown>>;

    for (const row of this.#rows) {
      const ok = await new ProjectTable(row.table).insert({
        [ACCOUNT_FOREIGN_KEY]: identity.id,
        ...filledColumns(row.fields, given[row.key] ?? {}),
      });

      if (!ok) {
        await this.forget(identity.id);
        return false;
      }
    }

    return true;
  }

  /** Removes the account and, by the foreign keys that point at it, everything hanging off it. */
  async forget(id: string): Promise<void> {
    await accounts()
      .unscoped()
      .where((f) => [f.id.eq(id), f.role.eq(this.name)])
      .delete();
  }

  /**
   * Whether this account may open a session right now, asking the role's own condition last.
   *
   * A ban answers before the condition does, so a declaration never has to remember to check for
   * one, and a role that declares no condition lets through everything a ban did not stop.
   */
  async admits(
    account: AccountIdentity & ReadOf<TGet>,
    device: RequestDevice,
    location: IpLocation,
    channel: Channel,
  ): Promise<Result<void, TRefusal | SignInRefusal>> {
    if (account.banned !== null) return new Failure(SignInRefusal.Banned);

    const condition = this.#options.signIn;
    if (condition === undefined) return okay;

    return await condition({ account, device, location, channel });
  }
}

/**
 * Declares one role an account can hold.
 *
 * ```ts
 * export const user = Account("user", {
 *   channels: [Channel.Email, Channel.Phone],
 *   signUp: (s) => ({
 *     profile: s.embed("app_user_profiles", (p: WriteSelector<ProfileRow>) => ({
 *       firstname: Required(p.first_name),
 *       birthday: Optional(p.birthday),
 *     })),
 *   }),
 *   get: (s) => ({
 *     profile: s.embed("app_user_profiles", (p: ReadSelector<ProfileRow>) => ({
 *       firstname: p.first_name,
 *       avatar: p.avatar_url,
 *     })),
 *   }),
 * });
 * ```
 *
 * @remarks
 * `signUp` and `get` are both required, including when a role adds nothing to what the engine
 * already holds: two empty braces say that the role asks for nothing and answers nothing extra,
 * where an absent key would leave the reader unable to tell that from a declaration nobody
 * finished.
 */
export function Account<
  const TChannels extends readonly Channel[],
  TGet extends ReadShape,
  TSignUp extends WriteShape,
  TRefusal = never,
>(
  name: string,
  options: AccountOptions<TChannels, TGet, TSignUp, TRefusal>,
): AccountDeclaration<TChannels, TGet, TSignUp, TRefusal> {
  return AccountDeclaration.declare(name, options);
}
