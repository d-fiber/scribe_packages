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

import { authSettings } from "./settings.ts";
import { pendingTokens } from "./tables.ts";
import type { AccountRole } from "../contracts/role.ts";
import { fromHex, sha256Hex, toHex } from "@scribe/core/runtime/support/crypto/hash.ts";

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

export interface PendingTokenPayload {
  readonly identifier: string;
  readonly role: AccountRole;
  readonly deviceId: string | null;
}

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

  get ttlMs(): number {
    return _TTL_MS[this.#purpose];
  }

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
        fromHex(sigHex),
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

  async exists(token: string): Promise<boolean> {
    const hash = await sha256Hex(token);
    const data = await pendingTokens()
      .unscoped()
      .select((s) => ({ token_hash: s.token_hash }))
      .where((f) => [f.token_hash.eq(hash), f.expires_at.gt(Date.now())])
      .getOne();
    return data !== null;
  }

  async consume(token: string): Promise<boolean> {
    const hash = await sha256Hex(token);
    const deleted = await pendingTokens()
      .unscoped()
      .where((f) => [f.token_hash.eq(hash), f.expires_at.gt(Date.now())])
      .deleteOne((s) => ({ token_hash: s.token_hash }));
    return deleted !== null;
  }
}
