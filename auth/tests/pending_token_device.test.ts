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
import { PendingToken } from "@scribe/auth/src/pending_token.ts";
import { assertEquals, assertNotEquals } from "@std/assert";
import { forgeToken } from "@scribe/auth/testing/pending_token.ts";

const token = new PendingToken();

installTestSettings();

Deno.test("the pending token carries the device that triggered the challenge", async () => {
  const raw = await forgeToken("a@example.com", "user", { deviceId: "device-1" });
  const payload = await token.payload(raw);

  assertEquals(payload?.identifier, "a@example.com");
  assertEquals(payload?.role, "user");
  assertEquals(payload?.deviceId, "device-1");
});

Deno.test("a challenge without a device explicitly carries null", async () => {
  const raw = await forgeToken("a@example.com", "user");
  assertEquals((await token.payload(raw))?.deviceId, null);
});

Deno.test("the device is covered by the signature: altering it invalidates the token", async () => {
  const raw = await forgeToken("a@example.com", "user", { deviceId: "device-1" });
  const [payloadB64, signature] = raw.split(".");

  const decoded = JSON.parse(atob(payloadB64)) as Record<string, unknown>;
  decoded.deviceId = "device-de-lattaquant";
  const forgedPayload = btoa(JSON.stringify(decoded));

  assertNotEquals(forgedPayload, payloadB64);
  assertEquals(await token.payload(`${forgedPayload}.${signature}`), null);
});

Deno.test("an expired token is refused", async () => {
  const raw = await forgeToken("a@example.com", "user", { deviceId: "device-1" });
  const [payloadB64, signature] = raw.split(".");
  const decoded = JSON.parse(atob(payloadB64)) as Record<string, unknown>;
  decoded.exp = Date.now() - 1;

  assertEquals(
    await token.payload(`${btoa(JSON.stringify(decoded))}.${signature}`),
    null,
  );
});
