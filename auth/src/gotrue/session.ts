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

import type { SignOutScope } from "@scribe/core/contracts/account.ts";
import type { Result } from "@scribe/core/contracts/result.ts";
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

export class GoTrueSession {
  refreshToken(
    refreshToken: string,
  ): Promise<Result<GoTrueSessionResponse, AuthError>> {
    return requestAuth(`${authUrl()}/token?grant_type=refresh_token`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  }

  user(accessToken: string): Promise<Result<GoTrueUser, AuthError>> {
    return requestAuth(`${authUrl()}/user`, {
      method: "GET",
      headers: userHeaders(accessToken),
    });
  }

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
