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
