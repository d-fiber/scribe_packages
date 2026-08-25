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

import { assert, assertFalse } from "@std/assert";
import { report, requireStack, RUN_ID, STACK, timed, useStack } from "./support/stack.ts";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { Audience } = await import("@scribe/audience");
const { forgetMembership } = await import("@scribe/audience/lib/src/runtime/cache.ts");
const { audiences } = await import("@scribe/audience/lib/src/db/tables.ts");

const editors = Audience.keyed(`e2e-cached-${RUN_ID}`);

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
