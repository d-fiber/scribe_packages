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

import { assert, assertEquals, assertFalse } from "@std/assert";
import { member, report, requireStack, RUN_ID, STACK, timed, useStack } from "./support/stack.ts";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { Audience, audiencesOf, forgetMember } = await import("@scribe/audience/mod.ts");
const { AudienceError } = await import("@scribe/audience/contracts/audience.ts");
const { audiences } = await import("@scribe/audience/src/db/tables.ts");

const banned = Audience.plain(`e2e-banned-${RUN_ID}`);
const editors = Audience.keyed(`e2e-editors-${RUN_ID}`);

Deno.test("audience e2e: a member put in is a row the database completed", async () => {
  const [added, took] = await timed(() => banned.add(member("a1")));

  assert(added.ok, "the insert was refused by the table");

  const row = await audiences()
    .where((f) => [f.audience.eq(banned.name), f.member.eq(member("a1"))])
    .getOne();

  assert(row, "the member the package put in names no row");
  assertEquals(row.expires_at, null, "a declaration without a delay must write no expiry");
  assert(row.created_at > 0, "the trigger did not stamp created_at");
  report("member added", `${Math.round(took)} ms`);
});

Deno.test("audience e2e: a member put in twice is held once", async () => {
  await editors.in("p1").add(member("a2"));
  await editors.in("p1").add(member("a2"));

  const rows = await audiences()
    .where((f) => [f.audience.eq(`${editors.name}:p1`), f.member.eq(member("a2"))])
    .get();

  assertEquals(rows.length, 1, "the primary key did not keep the pair unique");
});

Deno.test("audience e2e: two scopes of one declaration hold their own members", async () => {
  await editors.in("p2").add(member("a3"));

  assert(await editors.in("p2").has(member("a3")));
  assertFalse(await editors.in("p3").has(member("a3")), "another scope must not inherit the member");
  assertEquals(await editors.in("p2").members(), [member("a3")]);
  assertEquals(await editors.in("p3").members(), []);
});

Deno.test("audience e2e: a nested scope is an audience of its own", async () => {
  await editors.in("p4", "backend").add(member("a4"));

  assert(await editors.in("p4", "backend").has(member("a4")));
  assertFalse(await editors.in("p4").has(member("a4")), "narrowing must not write into the scope it narrows");
});

Deno.test("audience e2e: taking a member out is answered once, then not found", async () => {
  await editors.in("p5").add(member("a5"));

  const first = await editors.in("p5").remove(member("a5"));
  const second = await editors.in("p5").remove(member("a5"));

  assert(first.ok);
  assertFalse(second.ok);
  assertEquals(second.ok ? null : second.error, AudienceError.NotFound);
});

Deno.test("audience e2e: emptying an audience leaves its siblings alone", async () => {
  await editors.in("p6").add(member("a6"));
  await editors.in("p7").add(member("a7"));

  assert((await editors.in("p6").clear()).ok);

  assertEquals(await editors.in("p6").members(), []);
  assertEquals(await editors.in("p7").members(), [member("a7")]);
});

Deno.test("audience e2e: a member is listed under every audience it belongs to", async () => {
  await banned.add(member("a8"));
  await editors.in("p8").add(member("a8"));

  const [held, took] = await timed(() => audiencesOf(member("a8")));

  assertEquals(held.toSorted(), [banned.name, `${editors.name}:p8`].toSorted());
  report("audiences of a member", `${Math.round(took)} ms`);
});

Deno.test("audience e2e: a member that is forgotten belongs nowhere", async () => {
  await banned.add(member("a9"));
  await editors.in("p9").add(member("a9"));
  assert(await banned.has(member("a9")));
  assert(await editors.in("p9").has(member("a9")));

  assert((await forgetMember(member("a9"))).ok);

  assertFalse(await banned.has(member("a9")), "forgetting must drop what the cache holds");
  assertFalse(await editors.in("p9").has(member("a9")));
  assertEquals(await audiencesOf(member("a9")), []);
});
