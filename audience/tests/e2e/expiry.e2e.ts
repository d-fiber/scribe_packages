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
import { Duration } from "@scribe/alchemy";
import { requireStack, RUN_ID, STACK, useStack } from "./support/stack.ts";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { Audience } = await import("@scribe/audience");
const { AudienceError } = await import("@scribe/audience/lib/contracts/audience.ts");
const { audiences } = await import("@scribe/audience/lib/src/db/tables.ts");

const invited = Audience.keyed(`e2e-invited-${RUN_ID}`, { ttl: Duration.days(7) });

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
  assert(expiresAt >= before + Duration.days(7).inMilliseconds, "the expiry is closer than the declaration says");
});

Deno.test("audience e2e: a caller that names null keeps the member past the declaration", async () => {
  await invited.in("p2").add("b2", { ttl: null });

  assertEquals(await expiryOf(`${invited.name}:p2`, "b2"), null);
  assert(await invited.in("p2").has("b2"));
});

Deno.test("audience e2e: a membership past its expiry stops answering", async () => {
  await invited.in("p3").add("b3", { ttl: Duration.milliseconds(-1_000) });

  assertFalse(await invited.in("p3").has("b3"), "an expired membership must let nobody through");
  assertEquals(await invited.in("p3").members(), [], "an expired membership must not be listed");
});

Deno.test("audience e2e: retiming moves the expiry without touching the membership", async () => {
  await invited.in("p4").add("b4", { ttl: Duration.minutes(1) });
  const before = await expiryOf(`${invited.name}:p4`, "b4");

  assert((await invited.in("p4").ttl("b4", null)).ok);

  assert(before !== null);
  assertEquals(await expiryOf(`${invited.name}:p4`, "b4"), null);
  assert(await invited.in("p4").has("b4"), "the member must survive the retiming");
});

Deno.test("audience e2e: retiming a membership that expired answers not found", async () => {
  await invited.in("p5").add("b5", { ttl: Duration.milliseconds(-1_000) });

  const retimed = await invited.in("p5").ttl("b5", Duration.days(1));

  assertFalse(retimed.ok);
  assertEquals(retimed.ok ? null : retimed.error, AudienceError.NotFound);
});
