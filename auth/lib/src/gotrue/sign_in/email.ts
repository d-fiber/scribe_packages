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

import type { Result } from "@scribe/alchemy";
import type { AccountRole } from "../../../contracts/role.ts";
import {
  anonHeaders,
  type AuthError,
  authUrl,
  type GoTrueSessionResponse,
  requestAuth,
  requestAuthVoid,
} from "../transport.ts";

/** The one-time-passcode path for an email sign-in: request a code, then trade it for a session. */
class GoTrueSignInEmailOtp {
  /** Sends a one-time code to `email`, creating the account first when `createUser` says to. */
  send(
    email: string,
    role: AccountRole,
    createUser = false,
  ): Promise<Result<void, AuthError>> {
    return requestAuthVoid(`${authUrl()}/otp`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ email, create_user: createUser, data: { role } }),
    });
  }

  /** Exchanges the code `send` sent to `email` for a session. */
  verify(
    email: string,
    otp: string,
  ): Promise<Result<GoTrueSessionResponse, AuthError>> {
    return requestAuth(`${authUrl()}/verify`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ email, token: otp, type: "email" }),
    });
  }
}

/**
 * GoTrue's password and email-link paths for signing in, plus the OTP path under `otp`.
 *
 * @remarks
 * Three ways into the same account: a password checked server-side, a one-time code sent to
 * the address, or a token lifted from a link GoTrue emailed. All three return the same session
 * shape, so a caller never has to branch on which one succeeded.
 */
export class GoTrueSignInEmail {
  /** The one-time-passcode half of an email sign-in, requesting and then verifying a code. */
  readonly otp = new GoTrueSignInEmailOtp();

  /**
   * Signs in with `email` and `password`, returning a session on success.
   *
   * @remarks
   * Requested anonymously: the password is what authenticates the call, not an existing
   * session.
   */
  withPassword(
    email: string,
    password: string,
  ): Promise<Result<GoTrueSessionResponse, AuthError>> {
    return requestAuth(`${authUrl()}/token?grant_type=password`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ email, password }),
    });
  }

  /**
   * Verifies the token from an email link and returns a session.
   *
   * @remarks
   * `type` names which link this is: GoTrue accepts several kinds through the same `verify`
   * endpoint, a magic-link sign-in, an invite, a recovery link among them, and this passes the
   * value straight through rather than choosing one for the caller.
   */
  verifyToken(
    tokenHash: string,
    type: string,
  ): Promise<Result<GoTrueSessionResponse, AuthError>> {
    return requestAuth(`${authUrl()}/verify`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ token_hash: tokenHash, type }),
    });
  }

  /**
   * Resends the sign-up confirmation email to `email`, tagged with the account's `role`.
   *
   * @remarks
   * Exists because the first confirmation email GoTrue sends at sign-up can be lost, expire, or
   * never arrive; this repeats it without creating a second account.
   */
  resendConfirmation(
    email: string,
    role: AccountRole,
  ): Promise<Result<void, AuthError>> {
    return requestAuthVoid(`${authUrl()}/resend`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ type: "signup", email, data: { role } }),
    });
  }
}
