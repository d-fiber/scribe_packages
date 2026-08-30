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
import "@scribe/runtime/scholium/runner.ts";
import { equals, expect, isNot, isTrue, lessThan, same, Scribe } from "@scribe/alchemy/test";
import "../../testing/settings.ts";
import { Duration, Now } from "@scribe/alchemy";
import { checkCacheDriver, FixedNow, MemoryCaches } from "@scribe/alchemy/test";
import { RedisCaches } from "../../../lib/src/cache/redis_caches.ts";
import { encodeCacheEntry } from "../../../lib/src/cache/cache_entry.ts";
import { type Kv, kv } from "../../../lib/src/redis/kv.ts";
import { installMock } from "../../testing/install.ts";
import { recordLog } from "../../testing/logger.ts";
import { installFakeRedis } from "./fake_redis.ts";
import { RedisCache } from "../../../lib/src/cache/redis_cache.ts";

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

Scribe.test("the Redis cache fails the conformity suite of the cache port, on the entry that outlived its ttl", async () => {
  const redis = installFakeRedis();
  const logged = recordLog();

  try {
    await checkCacheDriver(new RedisCaches());
  } finally {
    logged.restore();
    redis.restore();
  }
});

Scribe.test("the in-memory cache of alchemy keeps every promise of the port, which is what makes the suite honest", async () => {
  await checkCacheDriver(new MemoryCaches());
});

Scribe.test("an entry whose envelope says it expired is served, because nothing compares that envelope to the clock", async () => {
  const logged = recordLog();
  const stale = installMock(
    kv(),
    "get",
    (() => Promise.resolve(encodeCacheEntry("stale", 1_600_000_000_000, 0))) as unknown as Kv["get"],
  );

  try {
    const held = new RedisCaches().open<string>({ key: "expired", ttl: Duration.minutes(5) });

    expect(await withClock(() => held.get("ada")), equals(null));
  } finally {
    stale.restore();
    logged.restore();
  }
});

Scribe.test("what was added is what comes back, one at a time and as a batch", async () => {
  const redis = installFakeRedis();
  const logged = recordLog();

  try {
    const held = new RedisCaches().open<string>({ key: "held" });
    await held.add("ada", "one");
    await held.addMany([["grace", "two"], ["alan", "three"]]);

    expect(await held.get("ada"), equals("one"));
    expect(await held.getMany(["grace", "alan"]), equals(["two", "three"]));
  } finally {
    logged.restore();
    redis.restore();
  }
});

Scribe.test("an identifier nothing was held under answers null, alone and inside a batch", async () => {
  const redis = installFakeRedis();
  const logged = recordLog();

  try {
    const held = new RedisCaches().open<string>({ key: "absent" });

    expect(await held.get("nobody"), equals(null));
    expect(await held.getMany(["nobody", "nor anybody"]), equals([null, null]));
  } finally {
    logged.restore();
    redis.restore();
  }
});

Scribe.test("what was deleted is gone, and clearing forgets everything", async () => {
  const redis = installFakeRedis();
  const logged = recordLog();

  try {
    const held = new RedisCaches().open<string>({ key: "gone" });
    await held.add("ada", "one");
    await held.delete("ada");
    expect(await held.get("ada"), equals(null));

    await held.addMany([["a", "1"], ["b", "2"]]);
    await held.deleteMany("a", "b");
    expect(await held.getMany(["a", "b"]), equals([null, null]));

    await held.add("kept", "one");
    await held.clear();
    expect(await held.get("kept"), equals(null));
  } finally {
    logged.restore();
    redis.restore();
  }
});

Scribe.test("a computation handed to upsert runs once however many callers ask at the same time", async () => {
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

    expect(ran, equals(1), "ten callers of one key are one computation");
    expect(asked, equals(Array.from({ length: 10 }, () => "one")));
  } finally {
    logged.restore();
    redis.restore();
  }
});

Scribe.test("opening one key twice answers one store, and two keys answer two", () => {
  const driver = new RedisCaches();

  expect(driver.open({ key: "same" }), same(driver.open({ key: "same" })));
  expect(driver.open({ key: "a" }), isNot(same(driver.open({ key: "b" }))));
});

Scribe.test("a key reopened under other terms is one store, on the terms it was last opened with", () => {
  const driver = new RedisCaches();
  const logged = recordLog();

  try {
    const first = driver.open<string>({ key: "settled", ttl: Duration.minutes(1) });
    const second = driver.open<string>({ key: "settled", ttl: Duration.days(30) });

    expect(first, same(second));
    expect(second.constructor.name, equals("RedisCache"));
    expect((second as RedisCache<string>).ttl.inSeconds, equals(Duration.days(30).inSeconds));
    expect(logged.actions.includes("cache.key_declared_twice"), isTrue);
  } finally {
    logged.restore();
  }
});

Scribe.test("reading twenty identifiers costs one round trip and not twenty", async () => {
  const redis = installFakeRedis();
  const logged = recordLog();

  try {
    const held = new RedisCaches().open<string>({ key: "batch-read" });
    await held.addMany(Array.from({ length: 20 }, (_, at) => [`id-${at}`, `v-${at}`] as [string, string]));
    redis.forget();
    await held.getMany(Array.from({ length: 20 }, (_, at) => `id-${at}`));

    expect(redis.countOf("mget"), equals(1));
    expect(redis.roundTrips(), lessThan(3), "a loop over get would have cost twenty");
  } finally {
    logged.restore();
    redis.restore();
  }
});

Scribe.test("writing twenty entries costs one pipeline and not twenty round trips", async () => {
  const redis = installFakeRedis();
  const logged = recordLog();

  try {
    const held = new RedisCaches().open<string>({ key: "batch-write" });
    await held.addMany(Array.from({ length: 20 }, (_, at) => [`id-${at}`, `v-${at}`] as [string, string]));

    expect(redis.countOf("pipeline"), equals(1));
    expect(redis.countOf("setex"), equals(0));
  } finally {
    logged.restore();
    redis.restore();
  }
});

Scribe.test("a store that refuses every call is read as a miss and reported once", async () => {
  const logged = recordLog();
  const broken = installMock(
    kv(),
    "get",
    (() => Promise.reject(new Error("connection reset"))) as unknown as Kv["get"],
  );

  try {
    const held = new RedisCaches().open<string>({ key: "down" });

    expect(await held.get("anything"), equals(null), "a cache outage degrades into a recomputation");
    expect(logged.actions, equals(["cache.operation_failed"]));
  } finally {
    broken.restore();
    logged.restore();
  }
});
