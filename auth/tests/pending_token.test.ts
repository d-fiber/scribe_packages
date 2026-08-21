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

import { installTestSettings } from "@scribe/core/testing/settings.ts";
import { assertEquals, assertNotEquals } from "@std/assert";
import { FakeTime } from "@std/testing/time";
import { Time } from "@scribe/core/contracts/common/time.ts";
import { PendingToken } from "@scribe/auth/src/pending_token.ts";
import { forgeToken } from "@scribe/auth/testing/pending_token.ts";

const token = new PendingToken();

installTestSettings();

Deno.test("pending token: the signed payload yields the identifier AND the role", async () => {
  const value = await forgeToken("u1@example.com", "user");
  const payload = await token.payload(value);

  assertEquals(payload?.identifier, "u1@example.com");
  assertEquals(payload?.role, "user");
});

Deno.test("pending token: the role is bound to the token, not inferred at verification", async () => {
  const asAdmin = await token.payload(
    await forgeToken("a1@example.com", "admin"),
  );
  const asUser = await token.payload(
    await forgeToken("a1@example.com", "user"),
  );

  assertNotEquals(asAdmin?.role, asUser?.role);
});

Deno.test("pending token: payload tampered without re-signing is rejected", async () => {
  const value = await forgeToken("u1@example.com", "user");
  const [payloadB64, signature] = value.split(".");

  const forged = JSON.stringify({
    identifier: "u1@example.com",
    role: "admin",
    exp: Date.now() + 60_000,
  });
  const forgedB64 = btoa(forged);

  assertNotEquals(forgedB64, payloadB64);
  assertEquals(await token.payload(`${forgedB64}.${signature}`), null);
});

Deno.test("pending token: an invalid signature is rejected without throwing", async () => {
  assertEquals(await token.payload("not-a-token"), null);
  assertEquals(await token.payload("aGVsbG8=.zzzz"), null);
  assertEquals(await token.payload(""), null);
});

Deno.test("pending token: a correctly signed but expired token is rejected", async () => {
  const time = new FakeTime();
  try {
    const value = await forgeToken("u1@example.com", "user");
    assertNotEquals(await token.payload(value), null);

    time.tick(Time.minutes(11).value * 1000);
    assertEquals(await token.payload(value), null);
  } finally {
    time.restore();
  }
});

Deno.test("two consecutive challenges never produce the same token", async () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    seen.add(await forgeToken("u1@example.com", "user", { deviceId: "device-1" }));
  }
  assertEquals(seen.size, 50, "the token must carry randomness, not only the timestamp");
});
