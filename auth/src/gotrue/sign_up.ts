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
import {
  isPhoneProviderConfigured,
  phoneNotConfiguredError,
  requestIdTokenExchange,
  SocialProvider,
} from "./primitives.ts";
import {
  adminHeaders,
  anonHeaders,
  type AuthError,
  authUrl,
  type GoTrueSessionResponse,
  type GoTrueUser,
  requestAuth,
} from "./transport.ts";

export class GoTrueSignUp {
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
    return response.ok ? new OK({ user: response.data }) : new Failure(response.error);
  }

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

  createUserWithGoogle(
    idToken: string,
    nonce: string,
    accessToken?: string,
  ): Promise<Result<GoTrueSessionResponse, AuthError>> {
    return requestIdTokenExchange(
      SocialProvider.Google,
      idToken,
      nonce,
      accessToken,
    );
  }

  createUserWithApple(
    idToken: string,
    nonce: string,
    accessToken?: string,
  ): Promise<Result<GoTrueSessionResponse, AuthError>> {
    return requestIdTokenExchange(
      SocialProvider.Apple,
      idToken,
      nonce,
      accessToken,
    );
  }
}
