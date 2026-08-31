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

import type { AccountRole } from "../../contracts/role.ts";
import { Failure, okay, type Result } from "@scribe/alchemy";
import {
  adminHeaders,
  type AuthError,
  authUrl,
  type GoTrueUser as GoTrueUserRecord,
  parseError,
  requestAuth,
  sendAuth,
} from "./transport.ts";

function userUrl(userId: string): string {
  return `${authUrl()}/admin/users/${encodeURIComponent(userId)}`;
}

/** The email half of {@link GoTrueUser}. */
class GoTrueUserEmail {
  /** Changes `userId`'s email through the admin API, since the user's own token cannot change its own identifier. */
  update(
    userId: string,
    email: string,
  ): Promise<Result<GoTrueUserRecord, AuthError>> {
    return requestAuth(userUrl(userId), {
      method: "PUT",
      headers: adminHeaders(),
      body: JSON.stringify({ email }),
    });
  }
}

/** The password half of {@link GoTrueUser}. */
class GoTrueUserPassword {
  /** Sets `userId`'s password directly through the admin API, without requiring the old one. */
  update(
    userId: string,
    password: string,
  ): Promise<Result<GoTrueUserRecord, AuthError>> {
    return requestAuth(userUrl(userId), {
      method: "PUT",
      headers: adminHeaders(),
      body: JSON.stringify({ password }),
    });
  }
}

/** The phone half of {@link GoTrueUser}. */
class GoTrueUserPhone {
  /** Changes `userId`'s phone number through the admin API, the same reasoning as {@link GoTrueUserEmail.update}. */
  update(
    userId: string,
    phone: string,
  ): Promise<Result<GoTrueUserRecord, AuthError>> {
    return requestAuth(userUrl(userId), {
      method: "PUT",
      headers: adminHeaders(),
      body: JSON.stringify({ phone }),
    });
  }
}

/** The role half of {@link GoTrueUser}. */
class GoTrueUserRole {
  /**
   * Sets the Postgres role `userId`'s session runs queries under, by writing it into GoTrue's own
   * `app_metadata` rather than a table this package owns.
   */
  update(
    userId: string,
    role: AccountRole,
  ): Promise<Result<GoTrueUserRecord, AuthError>> {
    return requestAuth(userUrl(userId), {
      method: "PUT",
      headers: adminHeaders(),
      body: JSON.stringify({ app_metadata: { role } }),
    });
  }
}

/** Every way this package reads and changes a signed-in user's own GoTrue account. */
export class GoTrueUser {
  /** Reading and changing the signed-in user's email. */
  readonly email = new GoTrueUserEmail();

  /** Changing the signed-in user's password. */
  readonly password = new GoTrueUserPassword();

  /** Reading and changing the signed-in user's phone number. */
  readonly phone = new GoTrueUserPhone();

  /** Changing the Postgres role a user's session runs queries under. */
  readonly role = new GoTrueUserRole();

  /** Deletes the GoTrue account `userId` names, treating an account already gone as success. */
  async delete(userId: string): Promise<Result<void, AuthError>> {
    const res = await sendAuth(userUrl(userId), {
      method: "DELETE",
      headers: adminHeaders(),
    });
    if (res.ok || res.statusCode === 404) return okay;
    return new Failure(parseError(res));
  }
}
