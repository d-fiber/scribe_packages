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

import { PendingToken, PendingTokenPurpose } from "@scribe/auth/src/pending_token.ts";
import { installTestSettings } from "@scribe/core/testing/settings.ts";
import { authSettings } from "@scribe/auth/src/settings.ts";
import { assertEquals, assertNotEquals } from "@std/assert";
import { forgeToken, issueToken } from "@scribe/auth/testing/pending_token.ts";
import { installAuthMock } from "@scribe/auth/testing/mock.ts";

installAuthMock();

const signIn = new PendingToken(PendingTokenPurpose.SignIn);
const reset = new PendingToken(PendingTokenPurpose.PasswordReset);

async function signPayload(claims: Record<string, unknown>): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSettings.get().pendingTokenSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new TextEncoder().encode(JSON.stringify(claims));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const payloadB64 = btoa(binary);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64),
  );
  const hex = Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${payloadB64}.${hex}`;
}

installTestSettings();

Deno.test("purpose: a password-reset token is refused by a sign-in reader", async () => {
  const token = await forgeToken("+33612345678", "user", { purpose: PendingTokenPurpose.PasswordReset });

  assertNotEquals(await reset.payload(token), null);
  assertEquals(
    await signIn.payload(token),
    null,
    "PENDING_TOKEN_SECRET is shared: without the purpose check, a reset token would pass sign-in's verify-otp",
  );
});

Deno.test("purpose: a sign-in token is refused by a password-reset reader", async () => {
  const token = await forgeToken("u1@example.com", "user", { purpose: PendingTokenPurpose.SignIn });

  assertNotEquals(await signIn.payload(token), null);
  assertEquals(await reset.payload(token), null);
});

Deno.test("purpose: the default instance stays on the sign-in purpose", async () => {
  const token = await issueToken(
    new PendingToken(),
    "u1@example.com",
    "user",
  );

  assertNotEquals(await signIn.payload(token), null);
  assertEquals(await reset.payload(token), null);
});

Deno.test("purpose: a legacy payload without purpose is read as sign-in", async () => {
  const legacy = await signPayload({
    identifier: "u1@example.com",
    role: "user",
    deviceId: null,
    jti: crypto.randomUUID(),
    exp: Date.now() + 60_000,
  });

  assertNotEquals(
    await signIn.payload(legacy),
    null,
    "tokens already in flight at deploy time must keep working until they expire",
  );
  assertEquals(await reset.payload(legacy), null);
});

Deno.test("purpose: swapping the purpose without re-signing is rejected", async () => {
  const token = await forgeToken("u1@example.com", "user", { purpose: PendingTokenPurpose.SignIn });
  const [payloadB64, signature] = token.split(".");

  const decoded = JSON.parse(atob(payloadB64)) as Record<string, unknown>;
  decoded.purpose = PendingTokenPurpose.PasswordReset;
  const forgedB64 = btoa(JSON.stringify(decoded));

  assertEquals(await reset.payload(`${forgedB64}.${signature}`), null);
  assertEquals(await signIn.payload(`${forgedB64}.${signature}`), null);
});

Deno.test("purpose: the role check still applies within one purpose", async () => {
  const token = await forgeToken("a1@example.com", "admin", { purpose: PendingTokenPurpose.PasswordReset });
  const payload = await reset.payload(token);

  assertEquals(payload?.role, "admin");
  assertNotEquals(payload?.role, "user");
});
