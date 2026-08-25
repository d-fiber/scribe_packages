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
import { DistributedFlight } from "@scribe/foundation/lib/src/cache/flight/distributed_flight.ts";
import type { DistributedLock, LockOutcome } from "@scribe/foundation/lib/src/cache/lock/distributed_lock.ts";
import { LocalFlight } from "@scribe/foundation/lib/src/cache/flight/local_flight.ts";
import { RedisCache } from "@scribe/foundation/lib/src/cache/redis_cache.ts";
import { installFakeRedis } from "./support/redis.ts";
import { assert, assertEquals, assertRejects } from "@std/assert";

const FIVE_MINUTES = Duration.minutes(5);

function answering(after: number, value: string): () => Promise<string> {
  return () => new Promise((done) => setTimeout(() => done(value), after));
}

class HeldLock {
  acquired = 0;
  #onAcquire: (count: number) => void;

  constructor(onAcquire: (count: number) => void = () => {}) {
    this.#onAcquire = onAcquire;
  }

  acquire(): Promise<LockOutcome> {
    this.acquired++;
    this.#onAcquire(this.acquired);
    return Promise.resolve({ state: "held" as const });
  }

  release(): Promise<void> {
    return Promise.resolve();
  }
}

function flightOf(lock: HeldLock, gaveUp: string[]): DistributedFlight {
  return new DistributedFlight(lock as unknown as DistributedLock, (id) => gaveUp.push(id));
}

const logged = installDrivers();

Deno.test("a hundred callers of one key pay one computation and one read", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "burst", ttl: FIVE_MINUTES });
    let computed = 0;
    const asked = [];

    for (let caller = 0; caller < 100; caller++) {
      asked.push(cache.upsert("k", () => {
        computed++;
        return answering(20, "value")();
      }));
    }
    const answers = await Promise.all(asked);

    assertEquals(computed, 1, "the local tier must collapse a hundred callers into one run");
    assertEquals(new Set(answers).size, 1, "a hundred callers of one key must read one answer");
    assertEquals(redis.countOf("get"), 1, "a hundred callers must cost one read");
    assertEquals(redis.roundTrips, 4, "one read, one lock, one write, one release");
  } finally {
    redis.restore();
  }
});

Deno.test("two replicas of one key share one computation when the lease covers it", async () => {
  const redis = installFakeRedis();

  try {
    const budget = Duration.seconds(2);
    const one = new RedisCache<string>({ key: "pair", ttl: FIVE_MINUTES, deadline: budget });
    const two = new RedisCache<string>({ key: "pair", ttl: FIVE_MINUTES, deadline: budget });
    let computed = 0;
    const compute = (tag: string) => () => {
      computed++;
      return answering(120, tag)();
    };

    const answers = await Promise.all([one.upsert("k", compute("A")), two.upsert("k", compute("B"))]);

    assertEquals(computed, 1, "a lease longer than the work is what makes the second tier work");
    assertEquals(answers, ["A", "A"]);
  } finally {
    redis.restore();
  }
});

Deno.test({
  name:
    "two replicas of one key answer two different values when the computation outlives the lease",
  async fn() {
    const redis = installFakeRedis();

    try {
      const one = new RedisCache<string>({ key: "split", ttl: FIVE_MINUTES });
      const two = new RedisCache<string>({ key: "split", ttl: FIVE_MINUTES });
      let computed = 0;
      const compute = (tag: string) => () => {
        computed++;
        return answering(400, tag)();
      };

      const answers = await Promise.all([one.upsert("k", compute("A")), two.upsert("k", compute("B"))]);

      assertEquals(
        computed,
        1,
        "a four hundred millisecond computation is ordinary, and the default lease is two hundred and fifty",
      );
      assertEquals(
        new Set(answers).size,
        1,
        "a cache whose only job is to answer every caller the same thing answered two",
      );
    } finally {
      redis.restore();
    }
  },
});

Deno.test("a computation that rejects frees the lock and lets the next caller retry", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "boom", ttl: FIVE_MINUTES });

    await assertRejects(
      () => cache.upsert("k", () => Promise.reject(new Error("origin down"))),
      Error,
      "origin down",
    );

    assertEquals(redis.raw("lock:boom/k"), null, "a failed run must not hold the key");
    assertEquals(await cache.upsert("k", () => Promise.resolve("second try")), "second try");
  } finally {
    redis.restore();
  }
});

Deno.test("a rejection reaches every caller that joined the run", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "shared-boom", ttl: FIVE_MINUTES });
    let computed = 0;
    const failing = () => {
      computed++;
      return new Promise<string>((_, fail) => setTimeout(() => fail(new Error("origin down")), 20));
    };

    const asked = [cache.upsert("k", failing), cache.upsert("k", failing), cache.upsert("k", failing)];
    const raised = await Promise.allSettled(asked);

    assertEquals(computed, 1);
    assertEquals(raised.filter((one) => one.status === "rejected").length, 3);
  } finally {
    redis.restore();
  }
});

Deno.test({
  name: "a computation that never answers wedges its key in this process for as long as it hangs",
  async fn() {
    const redis = installFakeRedis();

    try {
      const cache = new RedisCache<string>({ key: "hung", ttl: FIVE_MINUTES });
      let started = 0;
      const hangs = () => {
        started++;
        return new Promise<string>(() => {});
      };

      cache.upsert("k", hangs);
      await answering(60, "")();

      let tick: ReturnType<typeof setTimeout> | 0 = 0;
      const answer = await Promise.race([
        cache.upsert("k", () => Promise.resolve("recovered")),
        new Promise<string>((done) => {
          tick = setTimeout(() => done("joined the hung run"), 200);
        }),
      ]);
      clearTimeout(tick);

      assertEquals(started, 1);
      assertEquals(
        answer,
        "recovered",
        "the origin recovered, and the key stays dead because nothing ever bounds the run held in the map",
      );
    } finally {
      redis.restore();
    }
  },
});

Deno.test("a loser that waits out its budget computes without the lock and says so", async () => {
  const redis = installFakeRedis();
  logged.clear();

  try {
    redis.place("lock:waited/k", "another replica", 60_000);
    const cache = new RedisCache<string>({
      key: "waited",
      ttl: FIVE_MINUTES,
      deadline: Duration.milliseconds(250),
    });
    let computed = 0;

    const answer = await cache.upsert("k", () => {
      computed++;
      return Promise.resolve("computed without the lock");
    });

    assertEquals(answer, "computed without the lock");
    assertEquals(computed, 1);
    assert(
      logged.actions.includes("cache.operation_failed"),
      "giving up on coordination has to leave a trace",
    );
  } finally {
    redis.restore();
  }
});

Deno.test("a loser pays two round trips for every fifty milliseconds it waits", async () => {
  const redis = installFakeRedis();

  try {
    redis.place("lock:polled/k", "another replica", 60_000);
    const cache = new RedisCache<string>({
      key: "polled",
      ttl: FIVE_MINUTES,
      deadline: Duration.milliseconds(250),
    });
    redis.clear();

    await cache.upsert("k", () => Promise.resolve("mine"));

    assert(
      redis.countOf("set") >= 4 && redis.countOf("set") <= 8,
      `a two hundred and fifty millisecond wait took ${redis.countOf("set")} lock attempts`,
    );
    assert(
      redis.roundTrips >= 9 && redis.roundTrips <= 16,
      `waiting a quarter of a second cost ${redis.roundTrips} round trips, one lock attempt and one read `
        + "back every fifty milliseconds",
    );
  } finally {
    redis.restore();
  }
});

Deno.test("a winner that dies without releasing frees the key when the lease runs out", async () => {
  const redis = installFakeRedis();
  const held = Now.get();
  const at = new FixedNow(DateTime.parse("2026-01-01T00:00:00Z").millisecondsSinceEpoch);
  Now.use(at);

  try {
    redis.place("lock:dead/k", "a replica that will not come back", 250);
    const cache = new RedisCache<string>({ key: "dead", ttl: FIVE_MINUTES });

    assertEquals(redis.raw("lock:dead/k"), "a replica that will not come back");
    at.pass(Duration.milliseconds(251));
    assertEquals(redis.raw("lock:dead/k"), null, "the lease is what frees a key nobody will release");

    assertEquals(await cache.upsert("k", () => Promise.resolve("the next replica")), "the next replica");
  } finally {
    Now.use(held);
    redis.restore();
  }
});

Deno.test({
  name: "a clock that stands still leaves a loser polling with no bound",
  async fn() {
    const held = Now.get();
    Now.use(new FixedNow(DateTime.parse("2026-01-01T00:00:00Z").millisecondsSinceEpoch));

    try {
      const lock = new HeldLock();
      const gaveUp: string[] = [];
      let reads = 0;

      await flightOf(lock, gaveUp).run(
        "id",
        "lock:id",
        () => Promise.resolve(++reads >= 20 ? "at last" : null),
        () => Promise.resolve("mine"),
        Duration.milliseconds(250),
      );

      assert(
        lock.acquired <= 7,
        `a two hundred and fifty millisecond budget bought ${lock.acquired} lock attempts, because the loop `
          + "asks a wall clock whether time has passed",
      );
    } finally {
      Now.use(held);
    }
  },
});

Deno.test({
  name: "a clock that steps backwards extends a loser's wait by the whole step",
  async fn() {
    const held = Now.get();
    const at = new FixedNow(DateTime.parse("2026-01-01T00:00:00Z").millisecondsSinceEpoch);
    Now.use(at);

    try {
      const lock = new HeldLock((count) => {
        at.pass(Duration.milliseconds(50));
        if (count === 2) at.pass(Duration.milliseconds(-500));
      });
      const gaveUp: string[] = [];

      await flightOf(lock, gaveUp).run(
        "id",
        "lock:id",
        () => Promise.resolve(null),
        () => Promise.resolve("mine"),
        Duration.milliseconds(250),
      );

      assert(
        lock.acquired <= 7,
        `one step back of half a second bought ${lock.acquired} lock attempts on a budget of a quarter of one`,
      );
    } finally {
      Now.use(held);
    }
  },
});

Deno.test("a hundred keys leave nothing behind in the local tier", async () => {
  const local = new LocalFlight();

  await Promise.all(
    Array.from({ length: 100 }, (_, i) => local.run(`k${i}`, () => Promise.resolve(i))),
  );

  assertEquals(local.size, 0, "a process that runs for a month must not grow a map of settled keys");
});
