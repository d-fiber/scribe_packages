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

import { Failure, OK, type Result } from "@scribe/core/contracts/result.ts";
import type { Ban, BanOptions } from "../contracts/account.ts";
import { accountBans } from "./tables.ts";
import { AccountRevocation } from "./revocation.ts";

/** Why a ban could not be written or lifted. */
export enum BanError {
  /** No account of this role answers to that identifier. */
  NotFound = "not_found",

  /** The database refused the write. */
  Backend = "backend",
}

/** A ban as it is listed, alongside the account it shuts out. */
export interface ListedBan extends Ban {
  /** The account this ban applies to. */
  readonly accountId: string;
}

/**
 * A ban as a caller reads it back, or null when the row means nothing any more.
 *
 * A ban past its deadline is not swept, it stops answering. Nothing collects it because a row is
 * three columns, and the next ban on the same account replaces it.
 */
export function banOf(raw: unknown): Ban | null {
  if (raw === null || typeof raw !== "object") return null;

  const row = raw as { since: number; until: number | null; reason: string | null };
  if (row.until !== null && row.until <= Date.now()) return null;

  return { since: row.since, until: row.until, reason: row.reason };
}

/**
 * The ban standing over an account, whatever role it holds.
 *
 * The role is not asked for because the caller that needs this most is a session being renewed,
 * which knows an identifier and nothing else. `Bans` is what scopes the question when an operator
 * asks it, and this is what the engine asks itself.
 */
export async function standingBanOn(id: string): Promise<Ban | null> {
  const row = await accountBans()
    .unscoped()
    .select((s) => ({ since: s.since, until: s.until, reason: s.reason }))
    .where((f) => f.account_id.eq(id))
    .getOne();

  return banOf(row);
}

/**
 * Who is shut out, among the accounts of one role.
 *
 * Every call goes through the role that owns it, which is what keeps a ban from being laid on an
 * account of another role by an operator who only holds this one.
 */
export class Bans {
  readonly #holds: (id: string) => Promise<boolean>;

  constructor(holds: (id: string) => Promise<boolean>) {
    this.#holds = holds;
  }

  /**
   * Shuts the account out until it is let back in, or until `options.for` has run out.
   *
   * A ban with no deadline is the default on purpose: one that lifts by itself has to be asked
   * for, never walked into.
   *
   * @remarks
   * Every session and every cache of the account is dropped on the way, so a ban takes hold
   * without waiting for anything to expire. An access token already issued is the one thing that
   * outlives it, until it runs out on its own: closing that window would cost a read on every
   * request the process serves.
   */
  async lay(id: string, options: BanOptions = {}): Promise<Result<void, BanError>> {
    if (!(await this.#holds(id))) return new Failure(BanError.NotFound);

    await accountBans()
      .unscoped()
      .where((f) => f.account_id.eq(id))
      .delete();

    const ban: Ban = {
      since: Date.now(),
      until: options.for ? Date.now() + options.for.ms : null,
      reason: options.reason ?? null,
    };

    const written = await accountBans().insert({ account_id: id, ...ban });
    if (!written) return new Failure(BanError.Backend);

    await AccountRevocation.caches(id);

    return new OK();
  }

  /** Lets the account back in, whether its ban had a deadline or not. */
  async lift(id: string): Promise<Result<void, BanError>> {
    const lifted = await accountBans()
      .unscoped()
      .where((f) => f.account_id.eq(id))
      .deleteOne();

    return lifted === null ? new Failure(BanError.NotFound) : new OK();
  }

  /** The ban standing over the account, or null when none stands or it holds another role. */
  async of(id: string): Promise<Ban | null> {
    return (await this.#holds(id)) ? await standingBanOn(id) : null;
  }

  /** Every ban standing right now, for whoever has a screen to fill with them. */
  async standing(): Promise<readonly ListedBan[]> {
    const rows = await accountBans()
      .unscoped()
      .select((s) => ({ account_id: s.account_id, since: s.since, until: s.until, reason: s.reason }))
      .get();

    return rows
      .map((row) => ({ accountId: row.account_id, ban: banOf(row) }))
      .filter((entry): entry is { accountId: string; ban: Ban } => entry.ban !== null)
      .map(({ accountId, ban }) => ({ accountId, ...ban }));
  }
}
