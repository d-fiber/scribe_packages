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

import { installAuthTestSettings } from "./settings.ts";

installAuthTestSettings();

import { type PendingToken, PendingTokenPurpose } from "../../lib/src/pending_token.ts";
import { toHex } from "@scribe/runtime/support/crypto/hash.ts";
import type { AccountRole } from "../../lib/contracts/role.ts";
import { authSettings } from "../../lib/src/settings.ts";

/** What a forged token carries beyond the identifier and the role it is minted for. */
export interface ForgedTokenOptions {
  /** What the token is for, which decides how long a real one would live. A sign-in when absent. */
  readonly purpose?: PendingTokenPurpose;

  /** The device the token is bound to, null for one that is bound to none. */
  readonly deviceId?: string | null;

  /** When the token stops being worth anything, in milliseconds. Ten minutes out when absent. */
  readonly expiresAt?: number;
}

function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSettings.get().pendingTokenSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * Signs a token exactly the way the real one is signed, without writing its digest down.
 *
 * A test that needs the raw token before it can seed the row carrying its digest cannot get one
 * out of `issue`, which writes first and answers second. `pending_token_forge.test.ts` pins this
 * against the real implementation, so a change to the signing format fails there rather than
 * quietly making every fixture unverifiable.
 */
export async function forgeToken(
  identifier: string,
  role: AccountRole,
  options: ForgedTokenOptions = {},
): Promise<string> {
  const utf8Bytes = new TextEncoder().encode(
    JSON.stringify({
      identifier,
      role,
      deviceId: options.deviceId ?? null,
      purpose: options.purpose ?? PendingTokenPurpose.SignIn,
      jti: crypto.randomUUID(),
      exp: options.expiresAt ?? Date.now() + 10 * 60 * 1000,
    }),
  );

  let binary = "";
  for (const byte of utf8Bytes) binary += String.fromCharCode(byte);
  const payloadB64 = btoa(binary);

  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    new TextEncoder().encode(payloadB64),
  );

  return `${payloadB64}.${toHex(signature)}`;
}

/**
 * Mints a real token through `issue`, and throws instead of answering null.
 *
 * `issue` answers null when the write fails, which in a test almost always means the database
 * stand-in was not installed. Throwing says that, where a null would surface much later as a
 * token that opens nothing.
 */
export async function issueToken(
  token: PendingToken,
  identifier: string,
  role: AccountRole,
  deviceId: string | null = null,
): Promise<string> {
  const value = await token.issue(identifier, role, deviceId);
  if (value === null) {
    throw new Error(
      "issueToken: PendingToken.issue() returned null, is the rest mock installed?",
    );
  }
  return value;
}
