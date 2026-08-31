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

import { Failure, Ok, type Result } from "@scribe/alchemy";
import { SocialProvider } from "@scribe/contracts/enums.ts";
import { isPhoneProviderConfigured, phoneNotConfiguredError, requestIdTokenExchange } from "./primitives.ts";
import {
  adminHeaders,
  anonHeaders,
  type AuthError,
  authUrl,
  type GoTrueSessionResponse,
  type GoTrueUser,
  requestAuth,
} from "./transport.ts";

/** Every way this package creates a new account with GoTrue. */
export class GoTrueSignUp {
  /** Creates an account with `email` and `password`, unconfirmed: GoTrue emails the confirmation link. */
  createUserWithEmail(
    email: string,
    password: string,
  ): Promise<Result<GoTrueSessionResponse, AuthError>> {
    return requestAuth(`${authUrl()}/signup`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ email, password }),
    });
  }

  /**
   * Creates an account with `email` and `password`, confirmed immediately through the admin API,
   * for a flow that verifies ownership some other way and does not want GoTrue's own email step.
   */
  async createConfirmedUserWithEmail(
    email: string,
    password: string,
  ): Promise<Result<GoTrueSessionResponse, AuthError>> {
    const response = await requestAuth<GoTrueUser>(
      `${authUrl()}/admin/users`,
      {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ email, password, email_confirm: true }),
      },
    );
    return response.ok ? new Ok({ user: response.data }) : new Failure(response.error);
  }

  /**
   * Creates an account with `phone` and `password`, unconfirmed: GoTrue sends the confirmation
   * code over `channel`.
   *
   * @remarks
   * Refused with {@link phoneNotConfiguredError} before any call to GoTrue when this deployment
   * has no phone provider configured, since GoTrue's own answer for that case is less specific.
   */
  createUserWithPhone(
    phone: string,
    password: string,
    channel: "sms" | "whatsapp" = "sms",
  ): Promise<Result<GoTrueSessionResponse, AuthError>> {
    if (!isPhoneProviderConfigured()) {
      return Promise.resolve(new Failure(phoneNotConfiguredError));
    }
    return requestAuth(`${authUrl()}/signup`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ phone, password, channel }),
    });
  }

  /** Creates an account from a Google ID token GoTrue exchanges for a session. */
  createUserWithGoogle(
    idToken: string,
    nonce: string,
    accessToken?: string,
  ): Promise<Result<GoTrueSessionResponse, AuthError>> {
    return requestIdTokenExchange(
      SocialProvider.GOOGLE,
      idToken,
      nonce,
      accessToken,
    );
  }

  /** Creates an account from an Apple ID token GoTrue exchanges for a session. */
  createUserWithApple(
    idToken: string,
    nonce: string,
    accessToken?: string,
  ): Promise<Result<GoTrueSessionResponse, AuthError>> {
    return requestIdTokenExchange(
      SocialProvider.APPLE,
      idToken,
      nonce,
      accessToken,
    );
  }
}
