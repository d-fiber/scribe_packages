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

import { report, requireStack, STACK, timed, useStack } from "./support/stack.ts";
import { assert, assertEquals } from "@std/assert";

await requireStack(STACK.natsMonitorUrl, `${STACK.restUrl}/`);
await useStack();

const { RedisCache } = await import("../../lib/src/cache/redis_cache.ts");
const { Duration } = await import("@scribe/alchemy");

function cache() {
  return new RedisCache<{ n: number }>({ key: "e2e:valkery", ttl: Duration.seconds(30) });
}

Deno.test("valkery: a value written to Redis comes back as it went in", async () => {
  const store = cache();
  await store.clear();

  const [, ms] = await timed(() => store.add("a", { n: 1 }));
  report("add round trip", `${ms.toFixed(2)} ms`);

  assertEquals(await store.get("a"), { n: 1 });
  assertEquals(await store.get("absent"), null);
});

Deno.test("valkery: getMany answers every id, misses included", async () => {
  const store = cache();
  await store.clear();
  await store.addMany([["a", { n: 1 }], ["b", { n: 2 }]]);

  assertEquals(await store.getMany(["a", "b", "absent"]), [{ n: 1 }, { n: 2 }, null]);
  assertEquals(await store.getMany([]), [], "an empty read must not reach Redis at all");
});

Deno.test("valkery: concurrent readers of a cold key compute it once", async () => {
  const store = cache();
  await store.clear();
  let computed = 0;

  const answers = await Promise.all([1, 2, 3, 4].map(() =>
    store.upsert("hot", async () => {
      computed++;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return { n: 42 };
    })
  ));

  assertEquals(computed, 1, "the two flight tiers exist so that four callers cost one compute");
  assert(answers.every((answer) => answer.n === 42));
});

Deno.test("valkery: an entry is served until its ttl runs out, then it is a miss", async () => {
  const store = new RedisCache<{ n: number }>({ key: "e2e:valkery:ttl", ttl: Duration.seconds(1) });
  await store.clear();
  await store.add("short", { n: 1 });

  assertEquals(await store.get("short"), { n: 1 });
  await new Promise((resolve) => setTimeout(resolve, 1_400));
  assertEquals(await store.get("short"), null);
});

Deno.test("valkery: delete and clear both take effect on the real store", async () => {
  const store = cache();
  await store.clear();
  await store.addMany([["a", { n: 1 }], ["b", { n: 2 }]]);

  await store.delete("a");
  assertEquals(await store.get("a"), null);
  assertEquals(await store.get("b"), { n: 2 });

  await store.clear();
  assertEquals(await store.get("b"), null);
});

Deno.test("valkery: a pipelined write costs a fraction of a sequential one", async () => {
  const store = cache();
  await store.clear();
  const count = 200;

  const [, oneByOne] = await timed(async () => {
    for (let i = 0; i < count; i++) await store.add(`k${i}`, { n: i });
  });
  const [, pipelined] = await timed(() =>
    store.addMany(Array.from({ length: count }, (_, i) => [`p${i}`, { n: i }] as [string, { n: number }]))
  );

  report(
    "sequential writes",
    `${(oneByOne / count).toFixed(3)} ms per write, or ${Math.round(count / oneByOne * 1000)} a second`,
  );
  report(
    "pipelined writes",
    `${(pipelined / count).toFixed(3)} ms per write, or ${Math.round(count / pipelined * 1000)} a second`,
  );
  assert(pipelined < oneByOne, "addMany exists to spend one round trip instead of many");

  await store.clear();
});
