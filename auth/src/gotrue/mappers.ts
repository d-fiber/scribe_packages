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

import { authSettings } from "../settings.ts";
import type { GoTrueSessionResponse, GoTrueUser } from "./transport.ts";
import type { Session } from "@scribe/core/contracts/account.ts";
import type { AccountRole } from "../../contracts/role.ts";
import {
  fromBase64Url,
  jsonFromBase64Url,
} from "@scribe/core/runtime/support/crypto/base64.ts";

class AccountMapper {
  static role(raw: GoTrueUser | GoTrueSessionResponse): AccountRole | null {
    const user: GoTrueUser | undefined = "app_metadata" in raw ? raw : raw.user;
    const role = user?.app_metadata.role;
    return typeof role === "string" && role.length > 0 ? role : null;
  }

  /** Who the identity service says was let in, as it describes them. */
  static user(raw: GoTrueUser): NonNullable<Session["user"]> {
    return { ...raw, id: raw.id };
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
