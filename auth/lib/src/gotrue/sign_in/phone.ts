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

import type { AccountRole } from "../../../contracts/role.ts";
import { Failure, type Result } from "@scribe/alchemy";
import { isPhoneProviderConfigured, phoneNotConfiguredError } from "../primitives.ts";
import {
  anonHeaders,
  type AuthError,
  authUrl,
  type GoTrueSessionResponse,
  requestAuth,
  requestAuthVoid,
} from "../transport.ts";

/**
 * GoTrue's phone sign-in paths: a one-time code, a verify step and a password path.
 *
 * @remarks
 * Every method here refuses locally, without reaching GoTrue, when the project has no phone
 * provider configured, since SMS delivery is a paid add-on GoTrue does not enable by default.
 */
export class GoTrueSignInPhone {
  /**
   * Sends a one-time code to `phone`, tagged with the account's `role`.
   *
   * @remarks
   * `createUser` decides whether GoTrue may register a new account for a phone number it has
   * not seen before, rather than refusing the request.
   */
  send(
    phone: string,
    role: AccountRole,
    createUser = false,
  ): Promise<Result<void, AuthError>> {
    if (!isPhoneProviderConfigured()) {
      return Promise.resolve(new Failure(phoneNotConfiguredError));
    }
    return requestAuthVoid(`${authUrl()}/otp`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ phone, create_user: createUser, data: { role } }),
    });
  }

  /**
   * Verifies the one-time code sent to `phone` and returns a session.
   *
   * @remarks
   * Always verifies as an `"sms"` code; unlike `GoTrueSignInEmail.verifyToken`, there is no
   * other kind of phone link to distinguish.
   */
  verify(
    phone: string,
    otp: string,
  ): Promise<Result<GoTrueSessionResponse, AuthError>> {
    if (!isPhoneProviderConfigured()) {
      return Promise.resolve(new Failure(phoneNotConfiguredError));
    }
    return requestAuth(`${authUrl()}/verify`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ phone, token: otp, type: "sms" }),
    });
  }

  /** Signs in with `phone` and `password`, returning a session on success. */
  withPassword(
    phone: string,
    password: string,
  ): Promise<Result<GoTrueSessionResponse, AuthError>> {
    if (!isPhoneProviderConfigured()) {
      return Promise.resolve(new Failure(phoneNotConfiguredError));
    }
    return requestAuth(`${authUrl()}/token?grant_type=password`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ phone, password }),
    });
  }

  /** Resends the phone sign-up confirmation code to `phone`, tagged with the account's `role`. */
  resendConfirmation(
    phone: string,
    role: AccountRole,
  ): Promise<Result<void, AuthError>> {
    if (!isPhoneProviderConfigured()) {
      return Promise.resolve(new Failure(phoneNotConfiguredError));
    }
    return requestAuthVoid(`${authUrl()}/resend`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ type: "sms", phone, data: { role } }),
    });
  }
}
