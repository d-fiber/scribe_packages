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

import "@scribe/foundation/tests/testing/settings.ts";
import { Duration, Now } from "@scribe/alchemy";
import { checkCacheDriver, FixedNow, MemoryCaches } from "@scribe/alchemy/test";
import { RedisCaches } from "@scribe/foundation/lib/src/cache/redis_caches.ts";
import { encodeCacheEntry } from "@scribe/foundation/lib/src/cache/cache_entry.ts";
import { type Kv, kv } from "@scribe/foundation/lib/src/redis/kv.ts";
import { installMock } from "@scribe/foundation/tests/testing/install.ts";
import { recordLog } from "@scribe/foundation/tests/testing/logger.ts";
import { installFakeRedis } from "./fake_redis.ts";
import { RedisCache } from "@scribe/foundation/lib/src/cache/redis_cache.ts";
import { assert, assertEquals, assertLess, assertNotStrictEquals, assertStrictEquals } from "@std/assert";

function withClock<T>(body: () => T): T {
  const held = Now.configured ? Now.get() : null;
  Now.use(new FixedNow(1_700_000_000_000));
  try {
    return body();
  } finally {
    if (held === null) Now.clear();
    else Now.use(held);
  }
}

Deno.test({
  name: "the Redis cache fails the conformity suite of the cache port, on the entry that outlived its ttl",
  async fn() {
    const redis = installFakeRedis();
    const logged = recordLog();

    try {
      await checkCacheDriver(new RedisCaches());
    } finally {
      logged.restore();
      redis.restore();
    }
  },
});

Deno.test("the in-memory cache of alchemy keeps every promise of the port, which is what makes the suite honest", async () => {
  await checkCacheDriver(new MemoryCaches());
});

Deno.test({
  name: "an entry whose envelope says it expired is served, because nothing compares that envelope to the clock",
  async fn() {
    const logged = recordLog();
    const stale = installMock(
      kv(),
      "get",
      (() => Promise.resolve(encodeCacheEntry("stale", 1_600_000_000_000, 0))) as unknown as Kv["get"],
    );

    try {
      const held = new RedisCaches().open<string>({ key: "expired", ttl: Duration.minutes(5) });

      assertEquals(await withClock(() => held.get("ada")), null);
    } finally {
      stale.restore();
      logged.restore();
    }
  },
});

Deno.test("what was added is what comes back, one at a time and as a batch", async () => {
  const redis = installFakeRedis();
  const logged = recordLog();

  try {
    const held = new RedisCaches().open<string>({ key: "held" });
    await held.add("ada", "one");
    await held.addMany([["grace", "two"], ["alan", "three"]]);

    assertEquals(await held.get("ada"), "one");
    assertEquals(await held.getMany(["grace", "alan"]), ["two", "three"]);
  } finally {
    logged.restore();
    redis.restore();
  }
});

Deno.test("an identifier nothing was held under answers null, alone and inside a batch", async () => {
  const redis = installFakeRedis();
  const logged = recordLog();

  try {
    const held = new RedisCaches().open<string>({ key: "absent" });

    assertEquals(await held.get("nobody"), null);
    assertEquals(await held.getMany(["nobody", "nor anybody"]), [null, null]);
  } finally {
    logged.restore();
    redis.restore();
  }
});

Deno.test("what was deleted is gone, and clearing forgets everything", async () => {
  const redis = installFakeRedis();
  const logged = recordLog();

  try {
    const held = new RedisCaches().open<string>({ key: "gone" });
    await held.add("ada", "one");
    await held.delete("ada");
    assertEquals(await held.get("ada"), null);

    await held.addMany([["a", "1"], ["b", "2"]]);
    await held.deleteMany("a", "b");
    assertEquals(await held.getMany(["a", "b"]), [null, null]);

    await held.add("kept", "one");
    await held.clear();
    assertEquals(await held.get("kept"), null);
  } finally {
    logged.restore();
    redis.restore();
  }
});

Deno.test("a computation handed to upsert runs once however many callers ask at the same time", async () => {
  const redis = installFakeRedis();
  const logged = recordLog();

  try {
    const held = new RedisCaches().open<string>({ key: "once" });
    let ran = 0;
    const compute = () => {
      ran++;
      return new Promise<string>((settle) => setTimeout(() => settle("one"), 1));
    };

    const asked = await Promise.all(Array.from({ length: 10 }, () => held.upsert("ada", compute)));

    assertEquals(ran, 1, "ten callers of one key are one computation");
    assertEquals(asked, Array.from({ length: 10 }, () => "one"));
  } finally {
    logged.restore();
    redis.restore();
  }
});

Deno.test("opening one key twice answers one store, and two keys answer two", () => {
  const driver = new RedisCaches();

  assertStrictEquals(driver.open({ key: "same" }), driver.open({ key: "same" }));
  assertNotStrictEquals(driver.open({ key: "a" }), driver.open({ key: "b" }));
});

Deno.test("a key reopened under other terms is one store, on the terms it was last opened with", () => {
  const driver = new RedisCaches();
  const logged = recordLog();

  try {
    const first = driver.open<string>({ key: "settled", ttl: Duration.minutes(1) });
    const second = driver.open<string>({ key: "settled", ttl: Duration.days(30) });

    assertStrictEquals(first, second);
    assertEquals(second.constructor.name, "RedisCache");
    assertEquals((second as RedisCache<string>).ttl.inSeconds, Duration.days(30).inSeconds);
    assert(logged.actions.includes("cache.key_declared_twice"));
  } finally {
    logged.restore();
  }
});

Deno.test("reading twenty identifiers costs one round trip and not twenty", async () => {
  const redis = installFakeRedis();
  const logged = recordLog();

  try {
    const held = new RedisCaches().open<string>({ key: "batch-read" });
    await held.addMany(Array.from({ length: 20 }, (_, at) => [`id-${at}`, `v-${at}`] as [string, string]));
    redis.forget();
    await held.getMany(Array.from({ length: 20 }, (_, at) => `id-${at}`));

    assertEquals(redis.countOf("mget"), 1);
    assertLess(redis.roundTrips(), 3, "a loop over get would have cost twenty");
  } finally {
    logged.restore();
    redis.restore();
  }
});

Deno.test("writing twenty entries costs one pipeline and not twenty round trips", async () => {
  const redis = installFakeRedis();
  const logged = recordLog();

  try {
    const held = new RedisCaches().open<string>({ key: "batch-write" });
    await held.addMany(Array.from({ length: 20 }, (_, at) => [`id-${at}`, `v-${at}`] as [string, string]));

    assertEquals(redis.countOf("pipeline"), 1);
    assertEquals(redis.countOf("setex"), 0);
  } finally {
    logged.restore();
    redis.restore();
  }
});

Deno.test("a store that refuses every call is read as a miss and reported once", async () => {
  const logged = recordLog();
  const broken = installMock(
    kv(),
    "get",
    (() => Promise.reject(new Error("connection reset"))) as unknown as Kv["get"],
  );

  try {
    const held = new RedisCaches().open<string>({ key: "down" });

    assertEquals(await held.get("anything"), null, "a cache outage degrades into a recomputation");
    assertEquals(logged.actions, ["cache.operation_failed"]);
  } finally {
    broken.restore();
    logged.restore();
  }
});
