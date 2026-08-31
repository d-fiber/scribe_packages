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

import type { SignOutScope } from "../../contracts/account.ts";
import type { Result } from "@scribe/alchemy";
import {
  adminHeaders,
  anonHeaders,
  type AuthError,
  authUrl,
  type GoTrueSessionResponse,
  type GoTrueUser,
  requestAuth,
  requestAuthVoid,
  userHeaders,
} from "./transport.ts";

/**
 * Reading, refreshing and ending the GoTrue session a sign-in produced.
 *
 * @remarks
 * Grouped apart from `GoTrueSignIn` because these calls all take an existing session's own access
 * token, not credentials: a caller reaches this once already signed in, to keep that session
 * alive or to close it, never to open a new one.
 */
export class GoTrueSession {
  /** Exchanges `refreshToken` for a new session, as GoTrue's own refresh grant answers it. */
  refreshToken(
    refreshToken: string,
  ): Promise<Result<GoTrueSessionResponse, AuthError>> {
    return requestAuth(`${authUrl()}/token?grant_type=refresh_token`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  }

  /** The GoTrue user `accessToken` names. */
  user(accessToken: string): Promise<Result<GoTrueUser, AuthError>> {
    return requestAuth(`${authUrl()}/user`, {
      method: "GET",
      headers: userHeaders(accessToken),
    });
  }

  /** Changes the email or phone `accessToken`'s user signs in with. */
  updateIdentifier(
    accessToken: string,
    identifier: { email: string } | { phone: string },
  ): Promise<Result<GoTrueUser, AuthError>> {
    return requestAuth(`${authUrl()}/user`, {
      method: "PUT",
      headers: userHeaders(accessToken),
      body: JSON.stringify(identifier),
    });
  }

  /** Confirms a phone number change with the one-time code `otp` sent to `phone`. */
  verifyPhoneChange(
    phone: string,
    otp: string,
  ): Promise<Result<GoTrueUser, AuthError>> {
    return requestAuth(`${authUrl()}/verify`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ phone, token: otp, type: "phone_change" }),
    });
  }

  /** Removes the external identity `identityId` from the user `accessToken` names. */
  unlinkIdentity(
    accessToken: string,
    identityId: string,
  ): Promise<Result<void, AuthError>> {
    return requestAuthVoid(
      `${authUrl()}/user/identities/${encodeURIComponent(identityId)}`,
      {
        method: "DELETE",
        headers: userHeaders(accessToken),
      },
    );
  }

  /** Ends the session `accessToken` names, at the reach `scope` describes. */
  logout(
    accessToken: string,
    scope: SignOutScope,
  ): Promise<Result<void, AuthError>> {
    return requestAuthVoid(`${authUrl()}/logout?scope=${scope}`, {
      method: "POST",
      headers: { ...adminHeaders(), Authorization: `Bearer ${accessToken}` },
    });
  }
}
