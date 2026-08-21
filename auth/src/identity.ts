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

import { Time } from "@scribe/core/contracts/common/time.ts";
import { KeyIndex } from "@scribe/core/runtime/redis/key_index.ts";
import { Valkery } from "@scribe/foundation/src/valkery/valkery.ts";
import type { AccountRole } from "../contracts/role.ts";
import { accounts } from "./tables.ts";

const ROLE_TTL = Time.seconds(300);
const INDEX_KEY = "account:role:index";
const EMAIL_ENTRY = "email:";
const PHONE_ENTRY = "phone:";

/**
 * What role an identifier holds, remembered so a resolution costs one read instead of a query.
 *
 * The address and the number are indexed alongside the identifier because a revocation has to
 * drop them without knowing which of them the account was found by.
 */
class RoleCache {
  readonly #email = new Valkery<AccountRole>({ key: "email:role", ttl: ROLE_TTL });
  readonly #phone = new Valkery<AccountRole>({ key: "phone:role", ttl: ROLE_TTL });
  readonly #id = new Valkery<AccountRole>({ key: "account:role", ttl: ROLE_TTL });
  readonly #index = new KeyIndex(INDEX_KEY, ROLE_TTL.value, "auth-cache:role");

  /** The role remembered for this address, or null when none was. */
  getByEmail(email: string): Promise<AccountRole | null> {
    return this.#email.get(email);
  }

  /** Remembers that `email` belongs to `id`, and holds that role. */
  async setByEmail(id: string, email: string, role: AccountRole): Promise<void> {
    await Promise.all([
      this.#email.add(email, role),
      this.#index.remember(id, `${EMAIL_ENTRY}${email}`),
    ]);
  }

  /** The role remembered for this number, or null when none was. */
  getByPhone(phone: string): Promise<AccountRole | null> {
    return this.#phone.get(phone);
  }

  /** Remembers that `phone` belongs to `id`, and holds that role. */
  async setByPhone(id: string, phone: string, role: AccountRole): Promise<void> {
    await Promise.all([
      this.#phone.add(phone, role),
      this.#index.remember(id, `${PHONE_ENTRY}${phone}`),
    ]);
  }

  /** The role remembered for this account, or null when none was. */
  getById(id: string): Promise<AccountRole | null> {
    return this.#id.get(id);
  }

  /** Remembers the role this account holds. */
  setById(id: string, role: AccountRole): Promise<void> {
    return this.#id.add(id, role);
  }

  /** Drops the account and every address and number it was indexed under. */
  async invalidate(id: string): Promise<void> {
    const entries = await this.#index.members(id);

    await Promise.all([
      this.#id.delete(id),
      ...entries.map((entry) =>
        entry.startsWith(EMAIL_ENTRY)
          ? this.#email.delete(entry.slice(EMAIL_ENTRY.length))
          : this.#phone.delete(entry.slice(PHONE_ENTRY.length))
      ),
    ]);

    await this.#index.forget(id);
  }
}

/** What role an identifier holds, for the five seconds a burst of requests lasts. */
export const roleCache: RoleCache = new RoleCache();

/**
 * Which declaration an account belongs to, found from whatever the caller has in hand.
 *
 * The answer is one row of one table, so there is nothing to arbitrate: a role is a column, and
 * the registry is what turns the name it holds back into a declaration.
 */
export class AccountRoleResolver {
  /** The role of the account signing in with `email`, or null when the address is proven by none. */
  static async withEmail(email: string): Promise<AccountRole | null> {
    const cached = await roleCache.getByEmail(email);
    if (cached !== null) return cached;

    const row = await accounts()
      .unscoped()
      .select((s) => ({ id: s.id, role: s.role }))
      .where((f) => [f.email.eq(email), f.email_verified.eq(true)])
      .getOne();

    if (row === null) return null;

    await roleCache.setByEmail(row.id, email, row.role);
    return row.role;
  }

  /** The role of the account signing in with `phone`, or null when the number is proven by none. */
  static async withPhone(phone: string): Promise<AccountRole | null> {
    const cached = await roleCache.getByPhone(phone);
    if (cached !== null) return cached;

    const row = await accounts()
      .unscoped()
      .select((s) => ({ id: s.id, role: s.role }))
      .where((f) => [f.phone.eq(phone), f.phone_verified.eq(true)])
      .getOne();

    if (row === null) return null;

    await roleCache.setByPhone(row.id, phone, row.role);
    return row.role;
  }

  /** The role of the account `id` names, or null when no account answers to it. */
  static async withId(id: string): Promise<AccountRole | null> {
    const cached = await roleCache.getById(id);
    if (cached !== null) return cached;

    const row = await accounts()
      .unscoped()
      .select((s) => ({ role: s.role }))
      .where((f) => f.id.eq(id))
      .getOne();

    if (row === null) return null;

    await roleCache.setById(id, row.role);
    return row.role;
  }

  /** Whether the account `id` names holds `role`, which is what scopes a call to one declaration. */
  static async holds(id: string, role: AccountRole): Promise<boolean> {
    return (await this.withId(id)) === role;
  }

  /** Forgets what was cached about this account, by identifier and by every address it was indexed under. */
  static invalidate(id: string): Promise<void> {
    return roleCache.invalidate(id);
  }
}

/** How an account signs in, which is what a code or a link is sent to. */
export interface AccountIdentifiers {
  /** The address it signs in with, null when it came through another channel. */
  readonly email: string | null;

  /** The number it signs in with, null when it came through another channel. */
  readonly phone: string | null;
}

/**
 * How an account signs in, or null when no account answers to `id`.
 *
 * There is one query because there is one table. The framework used to ask two, one per role,
 * and take whichever answered.
 */
export async function identifiersOf(id: string): Promise<AccountIdentifiers | null> {
  const row = await accounts()
    .unscoped()
    .select((s) => ({ email: s.email, phone: s.phone }))
    .where((f) => f.id.eq(id))
    .getOne();

  return row === null ? null : { email: row.email, phone: row.phone };
}

/** The account that signs in with `identifier`, whether that is an address or a number. */
export async function accountWith(identifier: string): Promise<string | null> {
  const byEmail = identifier.includes("@");

  const row = await accounts()
    .unscoped()
    .select((s) => ({ id: s.id }))
    .where((f) => (byEmail ? f.email.eq(identifier) : f.phone.eq(identifier)))
    .getOne();

  return row?.id ?? null;
}
