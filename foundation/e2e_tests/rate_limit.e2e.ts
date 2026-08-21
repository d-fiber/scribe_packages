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

import { report, requireStack, STACK, timed, useStack } from "./support/stack.ts";
import { assert, assertEquals } from "@std/assert";

await requireStack(STACK.natsMonitorUrl, `${STACK.restUrl}/`);
await useStack();

const { RateLimit } = await import("@scribe/foundation/src/rate_limit/mod.ts");
const { kv } = await import("@scribe/foundation/src/redis/mod.ts");
const { Time } = await import("@scribe/core/contracts/common/time.ts");

async function clear(key: string): Promise<void> {
  await kv().del(`rl:blocked:${key}`, `rl:tat:${key}`, `rl:strikes:${key}`);
}

Deno.test("rate limit: the allowance runs out on the hit after the limit", async () => {
  const key = "e2e:rate-limit:allowance";
  await clear(key);

  const limit = new RateLimit({
    key,
    limit: 3,
    window: Time.seconds(30),
    penalty: Time.seconds(5),
  });

  const [first, ms] = await timed(() => limit.check());
  report("check round trip", `${ms.toFixed(2)} ms`);

  assertEquals(first, { ok: true, remaining: 2 });
  assertEquals(await limit.check(), { ok: true, remaining: 1 });
  assertEquals(await limit.check(), { ok: true, remaining: 0 });

  const refused = await limit.check();
  assert(!refused.ok, "the fourth hit is one over a limit of three");
  assertEquals(refused.strikes, 1);
});

Deno.test("rate limit: a refused caller stays refused until the penalty expires", async () => {
  const key = "e2e:rate-limit:penalty";
  await clear(key);

  const limit = new RateLimit({
    key,
    limit: 1,
    window: Time.seconds(30),
    penalty: Time.seconds(2),
  });

  await limit.check();
  const refused = await limit.check();
  assert(!refused.ok, "the second hit is one over a limit of one");

  assertEquals(await limit.isBlocked(), true);

  await new Promise((resolve) => setTimeout(resolve, 2_500));

  assertEquals(await limit.isBlocked(), false, "the block key carries its own expiry");
  assertEquals(await limit.check(), { ok: true, remaining: 0 });
});

Deno.test("rate limit: a second penalty lasts twice the first", async () => {
  const key = "e2e:rate-limit:escalation";
  await clear(key);

  const limit = new RateLimit({
    key,
    limit: 1,
    window: Time.seconds(30),
    penalty: Time.seconds(2),
    maxPenalty: Time.minutes(10),
  });

  await limit.check();
  const first = await limit.check();
  assert(!first.ok);
  assertEquals(first.strikes, 1);
  assertEquals(first.retryAfter, 2);

  await new Promise((resolve) => setTimeout(resolve, 2_500));

  await limit.check();
  const second = await limit.check();
  assert(!second.ok, "the window was dropped with the first penalty, so one hit is the allowance");
  assertEquals(second.strikes, 2);
  assertEquals(second.retryAfter, 4, "the strike memory outlives the block it caused");
});

Deno.test("rate limit: a penalty never exceeds the ceiling its declaration set", async () => {
  const key = "e2e:rate-limit:ceiling";
  await clear(key);

  const limit = new RateLimit({
    key,
    limit: 1,
    window: Time.seconds(30),
    penalty: Time.seconds(30),
    maxPenalty: Time.seconds(31),
  });

  await limit.check();
  const first = await limit.check();
  assert(!first.ok);
  assertEquals(first.retryAfter, 30);

  await kv().del(`rl:blocked:${key}`);
  await limit.check();
  const second = await limit.check();
  assert(!second.ok);
  assertEquals(second.retryAfter, 31, "sixty seconds of doubling is cut to the declared ceiling");
});

Deno.test("rate limit: a subject gets its own bucket inside one declaration", async () => {
  const key = "e2e:rate-limit:subject";
  await clear(`${key}:one`);
  await clear(`${key}:two`);

  const limit = new RateLimit({
    key,
    limit: 1,
    window: Time.seconds(30),
    penalty: Time.seconds(5),
  });

  await limit.check("", "one");
  const refused = await limit.check("", "one");
  assert(!refused.ok, "the second hit on the same subject is over the limit");

  assertEquals(await limit.check("", "two"), { ok: true, remaining: 0 });
  assertEquals(await limit.isBlocked("", "two"), false);
  assertEquals(await limit.isBlocked("", "one"), true);
});

Deno.test("rate limit: the allowance comes back one slot at a time", async () => {
  const key = "e2e:rate-limit:refill";
  await clear(key);

  const limit = new RateLimit({
    key,
    limit: 4,
    window: Time.seconds(4),
    penalty: Time.minutes(10),
  });

  assertEquals(await limit.check(), { ok: true, remaining: 3 });
  assertEquals(await limit.check(), { ok: true, remaining: 2 });
  assertEquals(await limit.check(), { ok: true, remaining: 1 });
  assertEquals(await limit.check(), { ok: true, remaining: 0 });

  await new Promise((resolve) => setTimeout(resolve, 1_200));

  assertEquals(
    await limit.check(),
    { ok: true, remaining: 0 },
    "one of the four slots came back after a quarter of the window, and one only",
  );

  const refused = await limit.check();
  assert(!refused.ok, "the second slot is not back yet, so nothing waits for a window to expire");
});

Deno.test("rate limit: a refused caller does not push its own release further away", async () => {
  const key = "e2e:rate-limit:no-self-harm";
  await clear(key);

  const limit = new RateLimit({
    key,
    limit: 1,
    window: Time.seconds(30),
    penalty: Time.seconds(20),
  });

  await limit.check();
  const first = await limit.check();
  assert(!first.ok);
  assertEquals(first.strikes, 1);

  const again = await limit.check();
  assert(!again.ok);
  assertEquals(again.strikes, 1, "hammering a running penalty earns no further strike");
  assert(again.retryAfter <= first.retryAfter, "and it does not extend the wait");
});
