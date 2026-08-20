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

import { assert, assertFalse } from "@std/assert";
import { report, requireStack, RUN_ID, STACK, timed, useStack } from "./support/stack.ts";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { Audience } = await import("@scribe/audience/mod.ts");
const { forgetMembership } = await import("@scribe/audience/src/runtime/cache.ts");
const { audiences } = await import("@scribe/audience/src/db/tables.ts");

const editors = Audience.scoped(`e2e-cached-${RUN_ID}`);

Deno.test("audience e2e: a membership answered once is answered from Redis, not from the table", async () => {
  await editors.in("p1").add("c1");

  const [first, cold] = await timed(() => editors.in("p1").has("c1"));
  const [second, warm] = await timed(() => editors.in("p1").has("c1"));
  assert(first && second);

  await audiences()
    .where((f) => [f.audience.eq(`${editors.name}:p1`), f.member.eq("c1")])
    .delete();

  assert(await editors.in("p1").has("c1"), "the row is gone and the answer still came, so nothing was cached");

  await forgetMembership(`${editors.name}:p1`, "c1");
  assertFalse(await editors.in("p1").has("c1"), "the cache kept answering after it was told to forget");
  report("membership read, cold then warm", `${Math.round(cold)} ms then ${Math.round(warm)} ms`);
});

Deno.test("audience e2e: an absence is cached too", async () => {
  assertFalse(await editors.in("p2").has("c2"));

  await audiences().insert({ audience: `${editors.name}:p2`, member: "c2", expires_at: null });

  assertFalse(
    await editors.in("p2").has("c2"),
    "an absence must be cached, otherwise every refused caller reaches the table",
  );

  await forgetMembership(`${editors.name}:p2`, "c2");
  assert(await editors.in("p2").has("c2"));
});

Deno.test("audience e2e: putting a member in and taking it out are seen at once", async () => {
  assertFalse(await editors.in("p3").has("c3"));

  await editors.in("p3").add("c3");
  assert(await editors.in("p3").has("c3"), "putting a member in must drop what the cache holds");

  await editors.in("p3").remove("c3");
  assertFalse(await editors.in("p3").has("c3"), "taking a member out must drop what the cache holds");
});

Deno.test("audience e2e: emptying an audience drops what the cache holds for all of its members", async () => {
  await editors.in("p4").add("c4");
  await editors.in("p4").add("c5");
  assert(await editors.in("p4").has("c4"));
  assert(await editors.in("p4").has("c5"));

  await editors.in("p4").clear();

  assertFalse(await editors.in("p4").has("c4"), "the sweep missed a member the cache still holds");
  assertFalse(await editors.in("p4").has("c5"));
});
