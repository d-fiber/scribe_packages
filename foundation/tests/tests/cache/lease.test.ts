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

import { DateTime, Duration, Now } from "@scribe/alchemy";
import { FixedNow } from "@scribe/alchemy/test";
import { installDrivers } from "@scribe/foundation/tests/testing/drivers.ts";
import { encodeCacheEntry } from "@scribe/foundation/lib/src/cache/cache_entry.ts";
import { DistributedLock } from "@scribe/foundation/lib/src/cache/lock/distributed_lock.ts";
import { RedisCache, refreshesSettled } from "@scribe/foundation/lib/src/cache/redis_cache.ts";
import { installFakeRedis } from "./support/redis.ts";
import { assert, assertEquals } from "@std/assert";

const FIVE_MINUTES = Duration.minutes(5);

function leasesOf(commands: readonly { name: string; args: readonly unknown[] }[]): number[] {
  return commands.filter((one) => one.name === "set").map((one) => Number(one.args[3]));
}

installDrivers();

Deno.test({
  name: "the lease a fill takes is the caller's budget, which is a quarter of a second by default",
  async fn() {
    const redis = installFakeRedis();

    try {
      const cache = new RedisCache<string>({ key: "lease", ttl: FIVE_MINUTES });
      await cache.upsert("k", () => Promise.resolve("v"));

      assert(
        leasesOf(redis.commands)[0] >= 1_000,
        `the key was leased for ${leasesOf(redis.commands)[0]} ms, which is shorter than any computation ` +
          "worth caching, so a second replica takes the key while the first is still working",
      );
    } finally {
      redis.restore();
    }
  },
});

Deno.test({
  name: "one lock key is leased two different lengths depending on which path took it",
  async fn() {
    const redis = installFakeRedis();

    try {
      const cache = new RedisCache<string>({ key: "twoways", ttl: FIVE_MINUTES });
      await cache.upsert("k", () => Promise.resolve("filled"));
      const fill = leasesOf(redis.commands)[0];

      redis.place(
        "twoways/k",
        encodeCacheEntry("stale", DateTime.now().millisecondsSinceEpoch + 5_000, 1_000_000),
        60_000,
      );
      redis.clear();
      await cache.upsert("k", () => Promise.resolve("refreshed"));
      await refreshesSettled();
      const refresh = leasesOf(redis.commands)[0];

      assertEquals(
        fill,
        refresh,
        "the same key, protecting the same computation, is held for two lengths nobody chose together",
      );
    } finally {
      redis.restore();
    }
  },
});

Deno.test("a lease shorter than the work lets a second replica in while the first is still working", async () => {
  const redis = installFakeRedis();
  const held = Now.get();
  const at = new FixedNow(DateTime.parse("2026-01-01T00:00:00Z").millisecondsSinceEpoch);
  Now.use(at);

  try {
    const lock = new DistributedLock(() => {});
    const first = await lock.acquire("lock:held/k", Duration.milliseconds(250));
    assertEquals(first.state, "acquired");

    at.pass(Duration.milliseconds(251));
    const second = await lock.acquire("lock:held/k", Duration.milliseconds(250));

    assertEquals(
      second.state,
      "acquired",
      "the lease expires on its own length, and nothing asks whether the work behind it has finished",
    );
  } finally {
    Now.use(held);
    redis.restore();
  }
});

Deno.test("a release with a token the lock no longer holds frees nothing", async () => {
  const redis = installFakeRedis();
  const held = Now.get();
  const at = new FixedNow(DateTime.parse("2026-01-01T00:00:00Z").millisecondsSinceEpoch);
  Now.use(at);

  try {
    const lock = new DistributedLock(() => {});
    const overrun = await lock.acquire("lock:held/k", Duration.milliseconds(250));
    assert(overrun.state === "acquired");

    at.pass(Duration.milliseconds(251));
    redis.place("lock:held/k", "the replica that came next", 250);

    await lock.release("lock:held/k", overrun.token);

    assertEquals(
      redis.raw("lock:held/k"),
      "the replica that came next",
      "a holder whose lease ran out must not free the key its successor is relying on",
    );
  } finally {
    Now.use(held);
    redis.restore();
  }
});

Deno.test("a lock that cannot be reached is told apart from one somebody holds", async () => {
  const redis = installFakeRedis();
  const reported: string[] = [];

  try {
    const lock = new DistributedLock((operation) => reported.push(operation));

    redis.place("lock:held/k", "somebody", 60_000);
    assertEquals((await lock.acquire("lock:held/k")).state, "held");

    redis.failNext("set", new Error("no redis"));
    assertEquals((await lock.acquire("lock:other")).state, "error");
    assertEquals(reported, ["lock"]);
  } finally {
    redis.restore();
  }
});

Deno.test("a release that cannot reach Redis is reported, not raised", async () => {
  const redis = installFakeRedis();
  const reported: string[] = [];

  try {
    const lock = new DistributedLock((operation) => reported.push(operation));
    redis.failNext("releaseLock", new Error("no redis"));

    await lock.release("lock:held/k", "a token");

    assertEquals(reported, ["unlock"]);
  } finally {
    redis.restore();
  }
});

Deno.test("a lock lives outside the namespace a sweep walks", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "swept", ttl: FIVE_MINUTES });
    redis.place("lock:swept/k", "a replica computing right now", 60_000);
    await cache.add("a", "one");

    await cache.clear();

    assertEquals(await cache.get("a"), null);
    assertEquals(
      redis.raw("lock:swept/k"),
      "a replica computing right now",
      "a sweep that took the lock with it would let a second replica in behind it",
    );
  } finally {
    redis.restore();
  }
});

Deno.test("a lease is refused to a second taker for as long as it lasts", async () => {
  const redis = installFakeRedis();
  const held = Now.get();
  const at = new FixedNow(DateTime.parse("2026-01-01T00:00:00Z").millisecondsSinceEpoch);
  Now.use(at);

  try {
    const lock = new DistributedLock(() => {});
    await lock.acquire("lock:held/k", Duration.seconds(10));

    at.pass(Duration.seconds(9));
    assertEquals((await lock.acquire("lock:held/k", Duration.seconds(10))).state, "held");

    at.pass(Duration.seconds(2));
    assertEquals((await lock.acquire("lock:held/k", Duration.seconds(10))).state, "acquired");
  } finally {
    Now.use(held);
    redis.restore();
  }
});

Deno.test("two takers of one key never both win", async () => {
  const redis = installFakeRedis();

  try {
    const lock = new DistributedLock(() => {});
    const outcomes = await Promise.all(
      Array.from({ length: 50 }, () => lock.acquire("lock:held/k", Duration.seconds(10))),
    );

    assertEquals(outcomes.filter((one) => one.state === "acquired").length, 1);
    assertEquals(
      new Set(outcomes.filter((one) => one.state === "acquired").map((one) => (one as { token: string }).token)).size,
      1,
    );
  } finally {
    redis.restore();
  }
});
