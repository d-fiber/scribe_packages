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

import { SignOutScope } from "@scribe/auth/lib/contracts/account.ts";
import { IdentityRevocation } from "@scribe/runtime/redis/identity_revocation.ts";
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
