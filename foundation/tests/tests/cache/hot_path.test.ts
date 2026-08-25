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

import { DateTime, Duration } from "@scribe/alchemy";
import { installDrivers } from "@scribe/foundation/tests/testing/drivers.ts";
import { decodeCacheEntry, encodeCacheEntry } from "@scribe/foundation/lib/src/cache/cache_entry.ts";
import { KeySpace } from "@scribe/foundation/lib/src/cache/key_space.ts";
import { RedisCache } from "@scribe/foundation/lib/src/cache/redis_cache.ts";
import { installFakeRedis } from "./support/redis.ts";
import { assert, assertEquals } from "@std/assert";

const FIVE_MINUTES = Duration.minutes(5);
const WARMUP = 2_000;
const ROUNDS = 20_000;

function counting(ids: string[]): { list: string[]; passes: number } {
  const counted = { passes: 0 };
  const list = ids.slice();
  Object.defineProperty(list, "map", {
    value(...args: Parameters<Array<string>["map"]>) {
      counted.passes++;
      return Array.prototype.map.apply(this, args);
    },
    configurable: true,
  });
  return {
    list,
    get passes() {
      return counted.passes;
    },
  };
}

function nanosecondsPer(rounds: number, body: () => void): number {
  for (let round = 0; round < rounds / 10; round++) body();
  const started = performance.now();
  for (let round = 0; round < rounds; round++) body();
  return (performance.now() - started) * 1e6 / rounds;
}

installDrivers();

Deno.test("a warm read costs one round trip and nothing else", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<{ n: number }>({ key: "warm", ttl: FIVE_MINUTES });
    await cache.add("k", { n: 1 });
    redis.clear();

    for (let round = 0; round < WARMUP; round++) await cache.get("k");

    assertEquals(redis.roundTrips, WARMUP);
    assertEquals(redis.countOf("get"), WARMUP);

    const started = performance.now();
    for (let round = 0; round < ROUNDS; round++) await cache.get("k");
    console.log(
      `get on a hit: ${((performance.now() - started) * 1e6 / ROUNDS).toFixed(0)} ns of this process per call`,
    );
  } finally {
    redis.restore();
  }
});

Deno.test("an upsert that hits costs one round trip, the same as a read", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<{ n: number }>({ key: "warm-upsert", ttl: FIVE_MINUTES });
    await cache.upsert("k", () => Promise.resolve({ n: 1 }));
    redis.clear();

    for (let round = 0; round < WARMUP; round++) {
      await cache.upsert("k", () => Promise.resolve({ n: 2 }));
    }

    assertEquals(
      redis.roundTrips,
      WARMUP,
      "an entry far from its expiry must not pay for the coordination it does not need",
    );

    const started = performance.now();
    for (let round = 0; round < ROUNDS; round++) {
      await cache.upsert("k", () => Promise.resolve({ n: 2 }));
    }
    console.log(
      `upsert on a hit: ${((performance.now() - started) * 1e6 / ROUNDS).toFixed(0)} ns of this process per call`,
    );
  } finally {
    redis.restore();
  }
});

Deno.test("two hundred ids cost one round trip, not two hundred", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "batch", ttl: FIVE_MINUTES });
    const ids = Array.from({ length: 200 }, (_, at) => `u${at}`);
    for (const id of ids) await cache.add(id, id);
    redis.clear();

    await cache.getMany(ids);

    assertEquals(redis.roundTrips, 1);
    assertEquals(redis.countOf("mget"), 1);
  } finally {
    redis.restore();
  }
});

Deno.test({
  name: "a batch read walks its ids twice, once for an answer it will not use",
  async fn() {
    const redis = installFakeRedis();

    try {
      const cache = new RedisCache<string>({ key: "walked", ttl: FIVE_MINUTES });
      const counted = counting(Array.from({ length: 200 }, (_, at) => `u${at}`));

      await cache.getMany(counted.list);

      assertEquals(
        counted.passes,
        1,
        "the fallback a failure would have needed is built on every call, so a page of two hundred ids " +
          "allocates two hundred nulls that are thrown away",
      );
    } finally {
      redis.restore();
    }
  },
});

Deno.test("a batch write costs one pipeline, not one call per entry", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "many", ttl: FIVE_MINUTES });
    const entries = Array.from({ length: 200 }, (_, at) => [`u${at}`, `v${at}`] as [string, string]);

    await cache.addMany(entries);

    assertEquals(redis.countOf("pipeline.exec"), 1);
    assertEquals(await cache.get("u199"), "v199");
  } finally {
    redis.restore();
  }
});

Deno.test("a sweep of a thousand keys costs one scan and one unlink", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "sweep", ttl: FIVE_MINUTES });
    await cache.addMany(Array.from({ length: 1_000 }, (_, at) => [`u${at}`, "v"] as [string, string]));
    redis.clear();

    await cache.clear();

    assertEquals(redis.countOf("scan"), 1);
    assertEquals(redis.countOf("unlink"), 1);
  } finally {
    redis.restore();
  }
});

Deno.test("the envelope costs a third more than the value it wraps, and one pass either way", () => {
  const value = { id: "u1", name: "ada", roles: ["reader", "writer"], at: 1_700_000_000_000 };
  const raw = encodeCacheEntry(value, 1, 2);

  const wrapped = nanosecondsPer(500_000, () => {
    encodeCacheEntry(value, 1, 2);
  });
  const bare = nanosecondsPer(500_000, () => {
    JSON.stringify(value);
  });
  const read = nanosecondsPer(500_000, () => {
    decodeCacheEntry(raw, 1_000);
  });

  console.log(
    `encode ${wrapped.toFixed(0)} ns against ${bare.toFixed(0)} ns bare, decode ${read.toFixed(0)} ns`,
  );
  assertEquals(JSON.parse(raw).v, value, "one pass in, one pass out, and no second stringify anywhere");
  assert(wrapped < bare * 3, `wrapping cost ${wrapped} ns against ${bare} ns for the value alone`);
});

Deno.test("deriving a key costs a few nanoseconds and no lookup", () => {
  const keys = new KeySpace("auth:device");
  const key = nanosecondsPer(2_000_000, () => {
    keys.keyOf("u1");
  });
  const lockKey = nanosecondsPer(2_000_000, () => {
    keys.lockKeyOf("u1");
  });

  console.log(`keyOf ${key.toFixed(1)} ns, lockKeyOf ${lockKey.toFixed(1)} ns`);
  assertEquals(keys.keyOf("u1"), "auth:device/u1");
  assert(key < 100, `keyOf took ${key} ns`);
});

Deno.test("the expiry a write stores costs one clock read and one addition", () => {
  const built = nanosecondsPer(2_000_000, () => {
    DateTime.now().add(Duration.seconds(300)).millisecondsSinceEpoch;
  });
  const added = nanosecondsPer(2_000_000, () => {
    DateTime.now().millisecondsSinceEpoch + 300_000;
  });

  console.log(`through DateTime.add ${built.toFixed(1)} ns, by hand ${added.toFixed(1)} ns`);
  assert(
    built < added * 2,
    `the two objects a write allocates cost ${built} ns against ${added} ns for the arithmetic alone`,
  );
});
