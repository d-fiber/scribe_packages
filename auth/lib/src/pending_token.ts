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

import { authSettings } from "./settings.ts";
import { pendingTokens } from "./tables.ts";
import type { AccountRole } from "../contracts/role.ts";
import { fromHex, sha256Hex, toHex } from "@scribe/runtime/support/crypto/hash.ts";

export enum PendingTokenPurpose {
  SignIn = "sign-in",
  PasswordReset = "password-reset",
  VpnAccess = "vpn-access",
}

const _TTL_MS: Record<PendingTokenPurpose, number> = {
  [PendingTokenPurpose.SignIn]: 10 * 60 * 1000,
  [PendingTokenPurpose.PasswordReset]: 10 * 60 * 1000,
  [PendingTokenPurpose.VpnAccess]: 4 * 60 * 60 * 1000,
};

export const MAX_PENDING_TOKEN_CHARS = 2048;

/** What a pending token proves once it has been verified: who asked, and for what role. */
export interface PendingTokenPayload {
  /** What the caller identified itself by when the token was issued. */
  readonly identifier: string;

  /** The role the token grants once redeemed. */
  readonly role: AccountRole;

  /** The device the token was issued to, or `null` when none was recorded. */
  readonly deviceId: string | null;
}

/** A single-purpose, HMAC-signed token that stands in for a completed step until it is redeemed or expires. */
export class PendingToken {
  readonly #purpose: PendingTokenPurpose;
  #hmacKey: Promise<CryptoKey> | null = null;

  constructor(purpose: PendingTokenPurpose = PendingTokenPurpose.SignIn) {
    this.#purpose = purpose;
  }

  /**
   * The signing key, imported once and kept.
   *
   * It is imported on first use rather than in the constructor because a declaration is built at
   * import time, before anything has filled the settings: reading the secret there would make
   * declaring an account depend on the order the modules happen to load in.
   */
  get #key(): Promise<CryptoKey> {
    if (this.#hmacKey === null) {
      this.#hmacKey = crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(authSettings.get().pendingTokenSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
      );
    }

    return this.#hmacKey;
  }

  /** How long, in milliseconds, a token issued for this purpose stays valid. */
  get ttlMs(): number {
    return _TTL_MS[this.#purpose];
  }

  /**
   * Signs and records a token for `identifier`, `role` and `deviceId`, or `null` when the record
   * could not be saved.
   */
  async issue(
    identifier: string,
    role: AccountRole,
    deviceId: string | null,
  ): Promise<string | null> {
    const expiresAt = Date.now() + this.ttlMs;
    const token = await this.#sign(identifier, role, deviceId, expiresAt);

    const saved = await pendingTokens().unscoped().insert({
      token_hash: await sha256Hex(token),
      expires_at: expiresAt,
    });

    return saved ? token : null;
  }

  async #sign(
    identifier: string,
    role: AccountRole,
    deviceId: string | null,
    expiresAt: number,
  ): Promise<string> {
    const key = await this.#key;
    const utf8Bytes = new TextEncoder().encode(
      JSON.stringify({
        identifier,
        role,
        deviceId,
        purpose: this.#purpose,
        jti: crypto.randomUUID(),
        exp: expiresAt,
      }),
    );
    let binary = "";
    for (const byte of utf8Bytes) binary += String.fromCharCode(byte);
    const payloadB64 = btoa(binary);
    const sigBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payloadB64),
    );
    return `${payloadB64}.${toHex(sigBuffer)}`;
  }

  /**
   * The payload `token` carries, once its signature verifies, it has not expired, and it was
   * issued for this instance's own purpose; `null` on any other outcome, malformed input included.
   *
   * @remarks
   * This checks the token's own signature and claims only. It does not consult the database, so
   * a token already {@link consume}d still verifies here. A caller that must refuse reuse checks
   * {@link exists} or consumes the token instead of relying on this alone.
   */
  async payload(token: string): Promise<PendingTokenPayload | null> {
    try {
      if (!token || token.length > MAX_PENDING_TOKEN_CHARS) return null;

      const dotIdx = token.indexOf(".");
      if (dotIdx === -1) return null;
      const payloadB64 = token.slice(0, dotIdx);
      const sigHex = token.slice(dotIdx + 1);

      const key = await this.#key;
      const valid = await crypto.subtle.verify(
        "HMAC",
        key,
        fromHex(sigHex) as BufferSource,
        new TextEncoder().encode(payloadB64),
      );
      if (!valid) return null;

      const utf8Bytes = Uint8Array.from(
        atob(payloadB64),
        (c) => c.charCodeAt(0),
      );
      const { identifier, role, deviceId, purpose, exp } = JSON.parse(
        new TextDecoder().decode(utf8Bytes),
      ) as {
        identifier: string;
        role: AccountRole;
        deviceId: string | null;
        purpose?: PendingTokenPurpose;
        exp: number;
      };
      if (Date.now() > exp) return null;
      if (!identifier || !role) return null;
      if ((purpose ?? PendingTokenPurpose.SignIn) !== this.#purpose) {
        return null;
      }

      return { identifier, role, deviceId: deviceId ?? null };
    } catch {
      return null;
    }
  }

  /** Whether `token`'s record still exists and has not expired, without consuming it. */
  async exists(token: string): Promise<boolean> {
    const hash = await sha256Hex(token);
    const data = await pendingTokens()
      .unscoped()
      .select((s) => ({ token_hash: s.token_hash }))
      .where((f) => [f.token_hash.eq(hash), f.expires_at.gt(Date.now())])
      .getOne();
    return data !== null;
  }

  /** Deletes `token`'s record if it still exists and has not expired, so it cannot be redeemed twice. */
  async consume(token: string): Promise<boolean> {
    const hash = await sha256Hex(token);
    const deleted = await pendingTokens()
      .unscoped()
      .where((f) => [f.token_hash.eq(hash), f.expires_at.gt(Date.now())])
      .deleteOne((s) => ({ token_hash: s.token_hash }));
    return deleted.ok;
  }
}
