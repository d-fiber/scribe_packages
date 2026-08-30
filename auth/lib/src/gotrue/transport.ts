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

import { http } from "@scribe/alchemy/http";
import { Duration } from "@scribe/alchemy";
import { Failure, Ok, okay, type Result } from "@scribe/alchemy";
import type { HttpResponse } from "@scribe/alchemy/http";
import { identitySettings } from "@scribe/runtime/support/settings/identity.ts";

export type AuthError = {
  /** The stable error code GoTrue reports, or `"unexpected_error"` when it reports none. */
  code: string;

  /** A message meant for a human, already picked from whichever field GoTrue used to carry it. */
  message: string;
};

/** One provider a GoTrue user has signed in with, as GoTrue itself reports it. */
export interface GoTrueIdentity {
  /** The identifier of this identity record, distinct from the user it belongs to. */
  identity_id: string;

  /** The identifier GoTrue assigned this identity, ahead of `identity_id` on some responses. */
  id: string;

  /** The identifier of the GoTrue user this identity is attached to. */
  user_id: string;

  /** The name of the provider that issued this identity, `"google"` or `"apple"` among others. */
  provider: string;

  /** Whatever the provider returned about the user, `email` and `sub` when the provider sent them. */
  identity_data?: { email?: string; sub?: string; [key: string]: unknown };

  /** When this identity was first linked to the user, or `null` when GoTrue did not report it. */
  created_at: string | null;

  /** When this identity was last used to sign in, or `null` when it never has been. */
  last_sign_in_at: string | null;
}

/** A user account as GoTrue itself reports it, before this package maps it to its own shape. */
export interface GoTrueUser {
  /** The identifier GoTrue assigned this user. */
  id: string;

  /** The Postgres role JWTs issued for this user carry, `"authenticated"` in the common case. */
  aud: string;

  /** The Postgres role this user's session runs queries under. */
  role: string;

  /** The user's email, or `null` when the account was created without one. */
  email: string | null;

  /** The user's phone number, or `null` when the account was created without one. */
  phone: string | null;

  /** When the user confirmed their email, or `null` when it is still unconfirmed. */
  email_confirmed_at: string | null;

  /** When the user confirmed their phone number, or `null` when it is still unconfirmed. */
  phone_confirmed_at: string | null;

  /** When either the email or the phone was confirmed, or `null` when neither is. */
  confirmed_at: string | null;

  /** When this user last completed a sign-in. */
  last_sign_in_at: string | null;

  /** Metadata GoTrue itself controls, `provider` and `role` among the keys it writes. */
  app_metadata: { provider?: string; role?: string; [key: string]: unknown };

  /** Metadata the user or the application set on the account, opaque to GoTrue. */
  user_metadata: Record<string, unknown>;

  /** Every provider identity linked to this user. */
  identities: GoTrueIdentity[];

  /** When this account was created. */
  created_at: string;

  /** When this account's record was last written. */
  updated_at: string;
}

/** What a sign-in or a token refresh against GoTrue answers with, on success. */
export interface GoTrueSessionResponse {
  /** The bearer token a caller now authenticates with, absent when the call did not start a session. */
  access_token?: string;

  /** The token that trades for a fresh `access_token` once this one expires. */
  refresh_token?: string;

  /** How many seconds `access_token` stays valid for, counted from the moment GoTrue answered. */
  expires_in?: number;

  /** The scheme `access_token` is presented under, `"bearer"` in practice. */
  token_type?: string;

  /** The account this session belongs to. */
  user?: GoTrueUser;
}

export function authUrl(): string {
  const url = identitySettings.get().authUrl;
  if (!url) {
    throw new Error(
      "AUTH_INTERNAL_URL is unset while the auth package is mounted, so no identity service can be reached.",
    );
  }

  return url;
}

export function anonHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    apikey: identitySettings.get().anonKey,
  };
}

const AUTH_TIMEOUT: Duration = Duration.seconds(10);

export function adminHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    apikey: identitySettings.get().serviceRoleKey,
    Authorization: `Bearer ${identitySettings.get().serviceRoleKey}`,
  };
}

export function userHeaders(jwt: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    apikey: identitySettings.get().anonKey,
    Authorization: `Bearer ${jwt}`,
  };
}

/** What a call to GoTrue carries. It is the subset of a request that every call site uses. */
export interface AuthRequest {
  /** The HTTP method to send, matched case-insensitively against `POST`, `PUT`, `PATCH` and `DELETE`. */
  readonly method: string;

  /** The headers to send, `Content-Type` and `apikey` among them; omitted when the call needs none. */
  readonly headers?: HeadersInit;

  /** The request body, already serialized; omitted for a call that carries none. */
  readonly body?: string;
}

export function parseError(res: HttpResponse): AuthError {
  try {
    const body = res.json<
      {
        error_code?: string;
        error?: string;
        msg?: string;
        error_description?: string;
      }
    >();
    return {
      code: body.error_code ?? body.error ?? "unexpected_error",
      message: body.msg ?? body.error_description ?? "Unexpected error",
    };
  } catch {
    return { code: "unexpected_error", message: "Unexpected error" };
  }
}

/**
 * Sends one call to GoTrue and closes the client behind it.
 *
 * The timeout is the whole point of routing this through the package client: GoTrue sits on the
 * sign-in path, and a request that never comes back holds the caller's request with it.
 */
export async function sendAuth(
  url: string,
  init: AuthRequest,
): Promise<HttpResponse> {
  const client = http.open();
  const options = {
    headers: init.headers,
    body: init.body ?? null,
    timeout: AUTH_TIMEOUT,
  };

  try {
    switch (init.method.toUpperCase()) {
      case "POST":
        return await client.post(url, options);
      case "PUT":
        return await client.put(url, options);
      case "PATCH":
        return await client.patch(url, options);
      case "DELETE":
        return await client.delete(url, options);
      default:
        return await client.get(url, options);
    }
  } finally {
    client.close();
  }
}

export async function requestAuth<T>(
  url: string,
  init: AuthRequest,
): Promise<Result<T, AuthError>> {
  const res = await sendAuth(url, init);
  if (!res.ok) return new Failure(parseError(res));
  return new Ok(res.json<T>());
}

export async function requestAuthVoid(
  url: string,
  init: AuthRequest,
): Promise<Result<void, AuthError>> {
  const res = await sendAuth(url, init);
  if (!res.ok) return new Failure(parseError(res));
  return okay;
}
