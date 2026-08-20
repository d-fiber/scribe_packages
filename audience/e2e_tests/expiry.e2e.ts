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

import { assert, assertEquals, assertFalse } from "@std/assert";
import { Time } from "@scribe/core/contracts/common/time.ts";
import { requireStack, RUN_ID, STACK, useStack } from "./support/stack.ts";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { Audience } = await import("@scribe/audience/mod.ts");
const { AudienceError } = await import("@scribe/audience/contracts/audience.ts");
const { audiences } = await import("@scribe/audience/src/db/tables.ts");

const invited = Audience.keyed(`e2e-invited-${RUN_ID}`, { ttl: Time.days(7) });

async function expiryOf(audience: string, member: string): Promise<number | null> {
  const row = await audiences()
    .where((f) => [f.audience.eq(audience), f.member.eq(member)])
    .getOne();

  return row?.expires_at ?? null;
}

Deno.test("audience e2e: the declared delay is what a member inherits", async () => {
  const before = Date.now();
  await invited.in("p1").add("b1");

  const expiresAt = await expiryOf(`${invited.name}:p1`, "b1");

  assert(expiresAt !== null, "the declared delay wrote no expiry");
  assert(expiresAt >= before + Time.days(7).ms, "the expiry is closer than the declaration says");
});

Deno.test("audience e2e: a caller that names null keeps the member past the declaration", async () => {
  await invited.in("p2").add("b2", { ttl: null });

  assertEquals(await expiryOf(`${invited.name}:p2`, "b2"), null);
  assert(await invited.in("p2").has("b2"));
});

Deno.test("audience e2e: a membership past its expiry stops answering", async () => {
  await invited.in("p3").add("b3", { ttl: Time.ms(-1_000) });

  assertFalse(await invited.in("p3").has("b3"), "an expired membership must let nobody through");
  assertEquals(await invited.in("p3").members(), [], "an expired membership must not be listed");
});

Deno.test("audience e2e: retiming moves the expiry without touching the membership", async () => {
  await invited.in("p4").add("b4", { ttl: Time.minutes(1) });
  const before = await expiryOf(`${invited.name}:p4`, "b4");

  assert((await invited.in("p4").ttl("b4", null)).ok);

  assert(before !== null);
  assertEquals(await expiryOf(`${invited.name}:p4`, "b4"), null);
  assert(await invited.in("p4").has("b4"), "the member must survive the retiming");
});

Deno.test("audience e2e: retiming a membership that expired answers not found", async () => {
  await invited.in("p5").add("b5", { ttl: Time.ms(-1_000) });

  const retimed = await invited.in("p5").ttl("b5", Time.days(1));

  assertFalse(retimed.ok);
  assertEquals(retimed.ok ? null : retimed.error, AudienceError.NotFound);
});
