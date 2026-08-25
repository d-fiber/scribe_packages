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

// The test forge re-implements the signing format so fixtures can be built
// before the database mock exists. That duplication is only safe as long as both
// sides stay interchangeable, which is exactly what this file checks.

import { installTestSettings } from "@scribe/testing/settings.ts";
import { PendingToken, PendingTokenPurpose } from "@scribe/auth/lib/src/pending_token.ts";
import { sha256Hex } from "@scribe/runtime/support/crypto/hash.ts";
import { installAuthMock } from "@scribe/auth/tests/testing/mock.ts";
import { forgeToken } from "@scribe/auth/tests/testing/pending_token.ts";
import { assert, assertEquals, assertNotEquals } from "@std/assert";

const IDENTIFIER = "u1@example.com";

installTestSettings();

Deno.test("forge: a forged token is accepted by the production reader", async () => {
  for (const purpose of Object.values(PendingTokenPurpose)) {
    const reader = new PendingToken(purpose);
    const token = await forgeToken(IDENTIFIER, "user", { purpose });
    const payload = await reader.payload(token);

    assertNotEquals(payload, null, `purpose ${purpose} must round-trip`);
    assertEquals(payload?.identifier, IDENTIFIER);
    assertEquals(payload?.role, "user");
  }
});

Deno.test("forge: an issued token is shaped exactly like a forged one", async () => {
  const database = installAuthMock();
  try {
    const issued = await new PendingToken().issue(IDENTIFIER, "user", "device-1");
    const forged = await forgeToken(IDENTIFIER, "user", { deviceId: "device-1" });

    assert(issued !== null);
    assertEquals(issued.split(".").length, forged.split(".").length);

    const [issuedPayload, issuedSignature] = issued.split(".");
    const [forgedPayload, forgedSignature] = forged.split(".");

    assertEquals(issuedSignature.length, forgedSignature.length);
    assertEquals(
      Object.keys(JSON.parse(atob(issuedPayload))).sort(),
      Object.keys(JSON.parse(atob(forgedPayload))).sort(),
      "a new claim on either side would make every fixture silently unverifiable",
    );
  } finally {
    database.restore();
  }
});

Deno.test("forge: the device binding survives the round-trip", async () => {
  const reader = new PendingToken();

  assertEquals(
    (await reader.payload(await forgeToken(IDENTIFIER, "user", { deviceId: "device-1" })))?.deviceId,
    "device-1",
  );
  assertEquals(
    (await reader.payload(await forgeToken(IDENTIFIER, "user")))?.deviceId,
    null,
  );
});

Deno.test("issue: the row it stores is the hash of the token it returns", async () => {
  const database = installAuthMock();
  try {
    const token = await new PendingToken().issue(IDENTIFIER, "user", null);
    const rows = database.rows("__pending_tokens__");

    assert(token !== null);
    assertEquals(rows.length, 1);
    assertEquals(rows[0].token_hash, await sha256Hex(token));
    assert(
      (rows[0].expires_at as number) > Date.now(),
      "an already-expired row would make the token unusable on arrival",
    );
  } finally {
    database.restore();
  }
});

Deno.test("issue: a vpn link outlives a sign-in challenge", () => {
  assertEquals(new PendingToken(PendingTokenPurpose.SignIn).ttlMs, 10 * 60 * 1000);
  assertEquals(
    new PendingToken(PendingTokenPurpose.VpnAccess).ttlMs,
    4 * 60 * 60 * 1000,
    "a mailed link survives a working half-day, not a full night",
  );
});

Deno.test("payload: an oversized token is rejected before any crypto work", async () => {
  const reader = new PendingToken();

  assertEquals(await reader.payload("x".repeat(2049)), null);
  assertEquals(await reader.payload(""), null);
});
