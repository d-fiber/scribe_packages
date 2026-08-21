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

import { Failure, OK, type Result } from "@scribe/core/contracts/result.ts";
import { currentClient } from "@scribe/foundation/lib/src/http/run_with_client.ts";
import type { Response as HttpResponse } from "@scribe/foundation/lib/src/http/response/response.ts";
import { identitySettings } from "@scribe/core/runtime/support/settings/identity.ts";

export type AuthError = { code: string; message: string };

export interface GoTrueIdentity {
  identity_id: string;
  id: string;
  user_id: string;
  provider: string;
  identity_data?: { email?: string; sub?: string; [key: string]: unknown };
  created_at: string | null;
  last_sign_in_at: string | null;
}

export interface GoTrueUser {
  id: string;
  aud: string;
  role: string;
  email: string | null;
  phone: string | null;
  email_confirmed_at: string | null;
  phone_confirmed_at: string | null;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
  app_metadata: { provider?: string; role?: string; [key: string]: unknown };
  user_metadata: Record<string, unknown>;
  identities: GoTrueIdentity[];
  created_at: string;
  updated_at: string;
}

export interface GoTrueSessionResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: GoTrueUser;
}

export function authUrl(): string {
  return identitySettings.get().authUrl;
}

export function anonHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    apikey: identitySettings.get().anonKey,
  };
}

const AUTH_TIMEOUT_MS = 10_000;

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
  readonly method: string;
  readonly headers?: HeadersInit;
  readonly body?: string;
}

export function parseError(res: HttpResponse): AuthError {
  try {
    const body = res.json<{ error_code?: string; error?: string; msg?: string; error_description?: string }>();
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
export async function sendAuth(url: string, init: AuthRequest): Promise<HttpResponse> {
  const client = currentClient();
  const options = { headers: init.headers, body: init.body ?? null, timeout: AUTH_TIMEOUT_MS };

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
  return new OK(res.json<T>());
}

export async function requestAuthVoid(
  url: string,
  init: AuthRequest,
): Promise<Result<void, AuthError>> {
  const res = await sendAuth(url, init);
  if (!res.ok) return new Failure(parseError(res));
  return new OK();
}
