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
import "@scribe/testing/runner.ts";
import { allOf, equals, expect, expectLater, isA, isTrue, Scribe, throwsA, withMessage } from "@scribe/alchemy/test";
import { DateTime, Duration, Now } from "@scribe/alchemy";
import { FixedNow } from "@scribe/alchemy/test";
import { installDrivers } from "../../testing/drivers.ts";
import { DistributedFlight } from "../../../lib/src/cache/flight/distributed_flight.ts";
import type { DistributedLock, LockOutcome } from "../../../lib/src/cache/lock/distributed_lock.ts";
import { LocalFlight } from "../../../lib/src/cache/flight/local_flight.ts";
import { RedisCache } from "../../../lib/src/cache/redis_cache.ts";
import { installFakeRedis } from "./support/redis.ts";
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

Scribe.test("a hundred callers of one key pay one computation and one read", async () => {
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

    expect(computed, equals(1), "the local tier must collapse a hundred callers into one run");
    expect(new Set(answers).size, equals(1), "a hundred callers of one key must read one answer");
    expect(redis.countOf("get"), equals(1), "a hundred callers must cost one read");
    expect(redis.roundTrips, equals(4), "one read, one lock, one write, one release");
  } finally {
    redis.restore();
  }
});

Scribe.test("two replicas of one key share one computation when the lease covers it", async () => {
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

    expect(computed, equals(1), "a lease longer than the work is what makes the second tier work");
    expect(answers, equals(["A", "A"]));
  } finally {
    redis.restore();
  }
});

Scribe.test("two replicas of one key answer two different values when the computation outlives the lease", async () => {
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

    expect(
      computed,
      equals(1),
      "a four hundred millisecond computation is ordinary, and the default lease is two hundred and fifty",
    );
    expect(
      new Set(answers).size,
      equals(1),
      "a cache whose only job is to answer every caller the same thing answered two",
    );
  } finally {
    redis.restore();
  }
});

Scribe.test("a computation that rejects frees the lock and lets the next caller retry", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "boom", ttl: FIVE_MINUTES });

    await expectLater(
      () => cache.upsert("k", () => Promise.reject(new Error("origin down"))),
      throwsA(allOf(isA(Error), withMessage("origin down"))),
    );

    expect(redis.raw("lock:boom/k"), equals(null), "a failed run must not hold the key");
    expect(await cache.upsert("k", () => Promise.resolve("second try")), equals("second try"));
  } finally {
    redis.restore();
  }
});

Scribe.test("a rejection reaches every caller that joined the run", async () => {
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

    expect(computed, equals(1));
    expect(raised.filter((one) => one.status === "rejected").length, equals(3));
  } finally {
    redis.restore();
  }
});

Scribe.test("a computation that never answers wedges its key in this process for as long as it hangs", async () => {
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

    expect(started, equals(1));
    expect(
      answer,
      equals("recovered"),
      "the origin recovered, and the key stays dead because nothing ever bounds the run held in the map",
    );
  } finally {
    redis.restore();
  }
});

Scribe.test("a loser that waits out its budget computes without the lock and says so", async () => {
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

    expect(answer, equals("computed without the lock"));
    expect(computed, equals(1));
    expect(logged.actions.includes("cache.operation_failed"), isTrue, "giving up on coordination has to leave a trace");
  } finally {
    redis.restore();
  }
});

Scribe.test("a loser pays one lock attempt and one read back per poll, and nothing else", async () => {
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

    const attempts = redis.countOf("set");
    expect(attempts >= 1, isTrue, "a loser has to reach for the lock before it gives up on it");
    expect(
      redis.countOf("get"),
      equals(attempts + 1),
      "one read back per attempt, plus the read that found nothing to begin with",
    );
    expect(redis.countOf("setex"), equals(1), "the loser writes what it computed, once");
    expect(
      redis.roundTrips,
      equals(2 * attempts + 2),
      `${redis.commands.map((one) => one.name).join(",")} carries something the poll does not need`,
    );
  } finally {
    redis.restore();
  }
});

Scribe.test("a winner that dies without releasing frees the key when the lease runs out", async () => {
  const redis = installFakeRedis();
  const held = Now.get();
  const at = new FixedNow(DateTime.parse("2026-01-01T00:00:00Z").millisecondsSinceEpoch);
  Now.use(at);

  try {
    redis.place("lock:dead/k", "a replica that will not come back", 250);
    const cache = new RedisCache<string>({ key: "dead", ttl: FIVE_MINUTES });

    expect(redis.raw("lock:dead/k"), equals("a replica that will not come back"));
    at.pass(Duration.milliseconds(251));
    expect(redis.raw("lock:dead/k"), equals(null), "the lease is what frees a key nobody will release");

    expect(await cache.upsert("k", () => Promise.resolve("the next replica")), equals("the next replica"));
  } finally {
    Now.use(held);
    redis.restore();
  }
});

Scribe.test("a clock that stands still leaves a loser polling with no bound", async () => {
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

    expect(
      lock.acquired <= 7,
      isTrue,
      `a two hundred and fifty millisecond budget bought ${lock.acquired} lock attempts, because the loop ` +
        "asks a wall clock whether time has passed",
    );
  } finally {
    Now.use(held);
  }
});

Scribe.test("a clock that steps backwards extends a loser's wait by the whole step", async () => {
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

    expect(
      lock.acquired <= 7,
      isTrue,
      `one step back of half a second bought ${lock.acquired} lock attempts on a budget of a quarter of one`,
    );
  } finally {
    Now.use(held);
  }
});

Scribe.test("a hundred keys leave nothing behind in the local tier", async () => {
  const local = new LocalFlight();

  await Promise.all(
    Array.from({ length: 100 }, (_, i) => local.run(`k${i}`, () => Promise.resolve(i))),
  );

  expect(local.size, equals(0), "a process that runs for a month must not grow a map of settled keys");
});
