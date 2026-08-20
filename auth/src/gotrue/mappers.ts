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

import { authSettings } from "../settings.ts";
import type { GoTrueSessionResponse, GoTrueUser } from "./transport.ts";
import type { Session, SessionUser } from "@scribe/core/contracts/account.ts";
import type { AccountRole } from "../../contracts/role.ts";
import { fromBase64Url, jsonFromBase64Url } from "@scribe/core/runtime/support/crypto/base64url.ts";

class AccountMapper {
  static role(raw: GoTrueUser | GoTrueSessionResponse): AccountRole | null {
    const user: GoTrueUser | undefined = "app_metadata" in raw ? raw : raw.user;
    const role = user?.app_metadata.role;
    return typeof role === "string" && role.length > 0 ? role : null;
  }

  static user(raw: GoTrueUser): SessionUser {
    return {
      id: raw.id,
      email: raw.email ? raw.email : null,
    };
  }

  static session(raw: GoTrueSessionResponse): Session {
    return {
      access_token: raw.access_token as string,
      refresh_token: raw.refresh_token as string,
      expires_in: raw.expires_in as number,
      token_type: raw.token_type ?? "bearer",
      user: raw.user ? AccountMapper.user(raw.user) : undefined,
    };
  }
}

class JwtMapper {
  static #key: Promise<CryptoKey> | null = null;

  private static decodeSegment(segment: string): Record<string, unknown> {
    const decoded = jsonFromBase64Url(segment);
    if (typeof decoded !== "object" || decoded === null) {
      throw new Error("jwt segment is not a JSON object");
    }
    return decoded as Record<string, unknown>;
  }

  private static hmacKey(): Promise<CryptoKey> {
    if (!JwtMapper.#key) {
      JwtMapper.#key = crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(authSettings.get().jwtSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
    }
    return JwtMapper.#key;
  }

  static expiresInUnverified(jwt: string): number {
    try {
      const payload = JwtMapper.decodeSegment(jwt.split(".")[1]);
      return Math.max(
        0,
        (payload.exp as number) - Math.floor(Date.now() / 1000),
      );
    } catch {
      return 0;
    }
  }

  static async account(
    jwt: string,
  ): Promise<{ userId: string; role: AccountRole } | null> {
    if (!authSettings.get().jwtSecret) return null;

    try {
      const [header, payload, signature] = jwt.split(".");
      if (!header || !payload || !signature) return null;

      const alg = JwtMapper.decodeSegment(header).alg;
      if (alg !== "HS256") return null;

      const signatureBytes = fromBase64Url(signature);
      if (signatureBytes === null) return null;

      const valid = await crypto.subtle.verify(
        "HMAC",
        await JwtMapper.hmacKey(),
        signatureBytes,
        new TextEncoder().encode(`${header}.${payload}`),
      );
      if (!valid) return null;

      const claims = JwtMapper.decodeSegment(payload);
      const exp = claims.exp as number | undefined;
      if (typeof exp !== "number" || exp <= Math.floor(Date.now() / 1000)) {
        return null;
      }

      const userId = claims.sub as string | undefined;
      if (!userId) return null;

      const role = AccountMapper.role(claims as unknown as GoTrueUser);
      if (role === null) return null;

      return { userId, role };
    } catch {
      return null;
    }
  }

  static async accountRole(jwt: string): Promise<AccountRole | null> {
    return (await JwtMapper.account(jwt))?.role ?? null;
  }
}

export class AuthMapper {
  static readonly account = AccountMapper;
  static readonly jwt = JwtMapper;
}
