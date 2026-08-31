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
import type { Session } from "../../contracts/account.ts";
import type { AccountRole } from "../../contracts/role.ts";
import { fromBase64Url, jsonFromBase64Url } from "@scribe/runtime/support/crypto/base64.ts";

/** GoTrue's wire shapes mapped onto this package's own account contract, `AuthMapper.account`'s implementation. */
class AccountMapper {
  /**
   * The Postgres role `raw` carries, or `null` when it carries none.
   *
   * @remarks
   * Accepts both a bare user and a session response, since a caller sometimes only has the
   * session GoTrue answered with and would otherwise have to unwrap `raw.user` itself first.
   */
  static role(raw: GoTrueUser | GoTrueSessionResponse): AccountRole | null {
    const user: GoTrueUser | undefined = "app_metadata" in raw ? raw : raw.user;
    const role = user?.app_metadata.role;
    return typeof role === "string" && role.length > 0 ? role : null;
  }

  /** Who the identity service says was let in, as it describes them. */
  static user(raw: GoTrueUser): NonNullable<Session["user"]> {
    return { ...raw, id: raw.id };
  }

  /**
   * `raw` mapped onto this package's own `Session` shape.
   *
   * @remarks
   * Casts `access_token`, `refresh_token` and `expires_in` rather than checking them, because this
   * mapper trusts the caller already decided `raw` is a real session, `sessionOf` in
   * `sign_in/doors.ts` checks `user` and `access_token` before ever calling this. Mapping a
   * response that failed that check would produce a `Session` whose token fields lie.
   */
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

/**
 * Reads a session JWT's claims locally, `AuthMapper.jwt`'s implementation.
 *
 * @remarks
 * Verifies the token's own HMAC signature with `JWT_SECRET`, the same secret GoTrue signs with,
 * rather than asking GoTrue whether the token is still good: a caller that only needs to know who
 * a token names, or how long it has left, would otherwise pay a network round trip for a question
 * the signature alone already answers.
 */
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

  /**
   * How many seconds until `jwt` expires, without checking its signature.
   *
   * @remarks
   * Unverified on purpose: `session.ts` calls this to report `expires_in` back to a caller only
   * after GoTrue itself has already confirmed the token is valid, so checking the signature again
   * here would repeat a check the network round trip already did. `account` is the one that
   * verifies, for a token whose origin is not already known.
   */
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

  /**
   * The user id and role `jwt` asserts, once its HMAC signature, algorithm and expiry all check
   * out, or `null` on any failure.
   *
   * @remarks
   * Refuses when `JWT_SECRET` is unset rather than skipping the check, refuses an algorithm other
   * than `HS256` even if the signature would otherwise verify, since accepting whatever the token
   * claims to be signed with is exactly the confusion an explicit algorithm list exists to close,
   * and refuses an expired token: any one of these failing answers `null`, the same as a token that
   * was never valid at all, so a caller cannot tell which check failed from the answer alone.
   */
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

  /** The role {@link account} verifies `jwt` to, or `null` when the token does not verify. */
  static async accountRole(jwt: string): Promise<AccountRole | null> {
    return (await JwtMapper.account(jwt))?.role ?? null;
  }
}

/**
 * The single door onto both mappers this package keeps: `account` for GoTrue's wire shapes,
 * `jwt` for reading a session token's claims locally.
 *
 * @remarks
 * `jwt` exists because a caller that only needs to know who a token belongs to, or whether it
 * has expired, would otherwise have to round-trip to GoTrue just to ask. Verifying the HMAC
 * signature locally, with the same secret GoTrue signs with, answers that without the network
 * call.
 */
export class AuthMapper {
  /** Maps a GoTrue user onto this package's own account shape. */
  static readonly account = AccountMapper;

  /** Reads a claim out of a signed JWT without going back to GoTrue for it. */
  static readonly jwt = JwtMapper;
}
