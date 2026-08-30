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
import { equals, expect, isTrue, Scribe } from "@scribe/alchemy/test";
import { Duration } from "@scribe/alchemy";
import { installDrivers } from "../../testing/drivers.ts";
import { RedisCache } from "../../../lib/src/cache/redis_cache.ts";
import { RedisCaches } from "../../../lib/src/cache/redis_caches.ts";
import { installFakeRedis } from "./support/redis.ts";
const FIVE_MINUTES = Duration.minutes(5);

installDrivers();

Scribe.test("a ttl that is not a whole number of seconds makes every write fail", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "half", ttl: Duration.milliseconds(1_500) });
    await cache.add("k", "v");
    const written = redis.commands.find((one) => one.name === "setex");

    expect(
      Number.isInteger(Number(written?.args[1])),
      isTrue,
      `SETEX was handed ${written?.args[1]} seconds, and Redis answers "value is not an integer or out of ` +
        'range" to anything that is not a whole number',
    );
  } finally {
    redis.restore();
  }
});

Scribe.test("a ttl of a second and a half turns every upsert into a computation and a lock", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "stampede", ttl: Duration.milliseconds(1_500) });
    let computed = 0;
    for (let call = 0; call < 3; call++) {
      await cache.upsert("k", () => {
        computed++;
        return Promise.resolve("v");
      });
    }

    expect(
      computed,
      equals(1),
      `three calls to one key ran ${computed} computations and cost ${redis.roundTrips} round trips, because ` +
        "nothing is ever written and every call is a cold one",
    );
  } finally {
    redis.restore();
  }
});

Scribe.test("a ttl of zero is refused before it reaches Redis, and it is reported", async () => {
  const redis = installFakeRedis();
  const logged = installDrivers();

  try {
    const cache = new RedisCache<string>({ key: "none", ttl: Duration.seconds(0) });
    await cache.add("k", "v");

    expect(redis.countOf("setex"), equals(0));
    expect(logged.actions.includes("cache.operation_failed"), isTrue);
  } finally {
    redis.restore();
  }
});

Scribe.test("an id of ten thousand characters survives the round trip", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "long", ttl: FIVE_MINUTES });
    const huge = "x".repeat(10_000);

    await cache.add(huge, "v");

    expect(await cache.get(huge), equals("v"));
    expect((redis.commands[0].args[0] as string).length, equals(10_005));
  } finally {
    redis.restore();
  }
});

Scribe.test("an empty id is its own entry and not the namespace", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "empty", ttl: FIVE_MINUTES });
    await cache.add("", "the nameless one");

    expect(await cache.get(""), equals("the nameless one"));
    expect(redis.commands[0].args[0], equals("empty/"), "an empty id is a key ending in the separator");
  } finally {
    redis.restore();
  }
});

Scribe.test("an id that carries the separator stays its own entry", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "sep", ttl: FIVE_MINUTES });
    await cache.add("a:b", "one");
    await cache.add("a", "two");

    expect(await cache.get("a:b"), equals("one"));
    expect(await cache.get("a"), equals("two"));
  } finally {
    redis.restore();
  }
});

Scribe.test("two caches whose names nest write one entry under one key", async () => {
  const redis = installFakeRedis();

  try {
    const outer = new RedisCache<string>({ key: "auth", ttl: FIVE_MINUTES });
    const inner = new RedisCache<string>({ key: "auth:device", ttl: FIVE_MINUTES });

    await outer.add("device:d1", "a session");
    await inner.add("d1", "a device");

    expect(
      await outer.get("device:d1"),
      equals("a session"),
      "two declarations that never heard of each other landed on one key, because a namespace and an " +
        "identifier are joined by the same colon and neither is escaped",
    );
  } finally {
    redis.restore();
  }
});

Scribe.test("a cache whose name prefixes another wipes it on clear", async () => {
  const redis = installFakeRedis();

  try {
    const outer = new RedisCache<string>({ key: "auth", ttl: FIVE_MINUTES });
    const inner = new RedisCache<string>({ key: "auth:device", ttl: FIVE_MINUTES });
    await outer.add("u1", "a session");
    await inner.add("d1", "a device");

    await outer.clear();

    expect(
      await inner.get("d1"),
      equals("a device"),
      "clearing one namespace took another namespace with it, because the sweep is a prefix glob and " +
        "nothing keeps two declared names from nesting",
    );
  } finally {
    redis.restore();
  }
});

Scribe.test("a star handed to clear sweeps the whole namespace, because the argument is a glob", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "glob", ttl: FIVE_MINUTES });
    await cache.add("kept", "one");

    await cache.clear("*");

    expect(
      await cache.get("kept"),
      equals(null),
      "an identifier passed here is read as a pattern, and nothing escapes what a caller hands over",
    );
  } finally {
    redis.restore();
  }
});

Scribe.test("a delete of an id that looks like a glob removes that id alone", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "star", ttl: FIVE_MINUTES });
    await cache.add("*", "the star itself");
    await cache.add("kept", "one");

    await cache.delete("*");

    expect(await cache.get("*"), equals(null));
    expect(await cache.get("kept"), equals("one"), "a delete names keys, so a glob in an id is just a character");
  } finally {
    redis.restore();
  }
});

Scribe.test("an empty list of anything costs nothing at all", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "nothing", ttl: FIVE_MINUTES });

    expect(await cache.getMany([]), equals([]));
    await cache.addMany([]);
    await cache.deleteMany();

    expect(redis.roundTrips, equals(0));
  } finally {
    redis.restore();
  }
});

Scribe.test("a store that cuts out between two calls reads as a miss and stays usable", async () => {
  const redis = installFakeRedis();
  const logged = installDrivers();

  try {
    const cache = new RedisCache<string>({ key: "flaky", ttl: FIVE_MINUTES });
    await cache.add("k", "v");

    redis.failNext("get", new Error("connection reset"));
    expect(await cache.get("k"), equals(null));
    expect(logged.actions.includes("cache.operation_failed"), isTrue);

    expect(await cache.get("k"), equals("v"), "one failed call must not take the cache down with it");
  } finally {
    redis.restore();
  }
});

Scribe.test("a batch read that fails answers one null per id asked for", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "batch", ttl: FIVE_MINUTES });
    redis.failNext("mget", new Error("connection reset"));

    expect(await cache.getMany(["a", "b", "c"]), equals([null, null, null]));
  } finally {
    redis.restore();
  }
});

Scribe.test("a payload that does not decode reads as a miss", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "junk", ttl: FIVE_MINUTES });
    redis.place("junk/k", "{not json");

    expect(await cache.get("k"), equals(null));
  } finally {
    redis.restore();
  }
});

Scribe.test("a value that carries the envelope's own marker survives the round trip", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<Record<string, unknown>>({ key: "lookalike", ttl: FIVE_MINUTES });
    const hostile = { $k: 1, v: "not the real value", e: 0, d: 0 };

    await cache.add("k", hostile);

    expect(await cache.get("k"), equals(hostile), "a domain object that mimics the envelope must not be unwrapped");
  } finally {
    redis.restore();
  }
});

Scribe.test("one key opened twice with two policies keeps the first, and says nothing", () => {
  const caches = new RedisCaches();
  const first = caches.open<string>({ key: "twice", ttl: Duration.minutes(5) }) as RedisCache<string>;
  const second = caches.open<string>({ key: "twice", ttl: Duration.days(30) }) as RedisCache<string>;

  expect(first === second, isTrue, "the port promises one store per key");
  expect(
    second.ttl.inSeconds,
    equals(Duration.days(30).inSeconds),
    "the second declaration asked for thirty days and was handed five minutes without a word",
  );
});
