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

import { SignOutScope } from "@scribe/core/contracts/account.ts";
import { IdentityRevocation } from "@scribe/core/runtime/redis/identity_revocation.ts";
import { goTrue } from "./gotrue/gotrue_client.ts";
import { deviceCache } from "./devices/cache.ts";
import { sessionIdempotence } from "./session.ts";
import { roleCache } from "./identity.ts";

/**
 * What stops answering when an account's credentials change hands.
 *
 * Every store that remembers something about the account is dropped in one call, because a
 * revocation that clears four of five leaves the fifth answering as if nothing had happened, and
 * which one was missed only shows up as a session that outlives its own sign-out.
 */
export class AccountRevocation {
  /** Ends every session of the account and drops everything remembered about it. */
  static async sessions(id: string, accessToken: string | null): Promise<void> {
    await Promise.all([
      accessToken ? this.session(accessToken, SignOutScope.Global) : Promise.resolve(),
      this.caches(id),
    ]);
  }

  /**
   * Ends one session at the identity provider.
   *
   * It never throws: a sign-out that failed at the provider must not stop the caches from being
   * dropped, since those are what the next request reads.
   */
  static async session(accessToken: string, scope: SignOutScope = SignOutScope.Local): Promise<void> {
    try {
      const answer = await goTrue.session.logout(accessToken, scope);
      if (!answer.ok) {
        console.error(
          `[account-revocation] ${scope} sign-out rejected by gotrue: ${answer.error.code} - ${answer.error.message}`,
        );
      }
    } catch (e) {
      console.error(`[account-revocation] ${scope} sign-out failed:`, e);
    }
  }

  /** Drops every store that remembers something about this account. */
  static async caches(id: string): Promise<void> {
    await Promise.all([
      IdentityRevocation.revoke(id),
      roleCache.invalidate(id),
      sessionIdempotence.invalidate(id),
      deviceCache.invalidateAll(id),
    ]);
  }
}
