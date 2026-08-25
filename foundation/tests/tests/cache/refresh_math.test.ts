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
import { decodeCacheEntry, encodeCacheEntry } from "@scribe/foundation/lib/src/cache/cache_entry.ts";
import type { CacheEntry } from "@scribe/foundation/lib/src/cache/cache_entry.ts";
import { shouldRefreshEarly } from "@scribe/foundation/lib/src/cache/early_expiry.ts";
import { RedisCache, refreshesSettled } from "@scribe/foundation/lib/src/cache/redis_cache.ts";
import { withJitter } from "@scribe/foundation/lib/src/cache/ttl_jitter.ts";
import { installFakeRedis } from "./support/redis.ts";
import { assert, assertEquals } from "@std/assert";

const NOW = 1_700_000_000_000;
const READERS = 10_000;

function volunteersOver(computeMs: number, ttlMs: number, beta = 1): number {
  let volunteered = 0;
  for (let reader = 0; reader < READERS; reader++) {
    const remaining = Math.floor((reader / READERS) * ttlMs);
    const entry: CacheEntry<string> = { value: "v", expiresAt: NOW + remaining, computeMs };
    if (shouldRefreshEarly(entry, beta, NOW)) volunteered++;
  }
  return volunteered / READERS;
}

installDrivers();

Deno.test("a costly value on a short ttl pulls two reads in five into a refresh", () => {
  const share = volunteersOver(500, 1_000);

  assert(
    share > 0.35 && share < 0.5,
    `half a second of computation under a one second ttl volunteers ${(share * 100).toFixed(1)} per cent of reads`,
  );
});

Deno.test("the same value on a one minute ttl volunteers one read in a hundred", () => {
  const share = volunteersOver(500, 60_000);

  assert(share < 0.02, `${(share * 100).toFixed(1)} per cent of reads volunteered`);
});

Deno.test("a computation nobody timed never volunteers", () => {
  assertEquals(volunteersOver(0, 1_000), 0);
  assertEquals(volunteersOver(0, -1), 0, "not even once the entry has expired");
});

Deno.test("a four millisecond computation volunteers only at the instant it expires", () => {
  const share = volunteersOver(4, 300_000);

  assertEquals(
    share,
    1 / READERS,
    "the one reader that draws the expiry itself, and nobody else in ten thousand",
  );
});

Deno.test("a beta that is zero or below never volunteers", () => {
  assertEquals(volunteersOver(500, 1_000, 0), 0);
  assertEquals(volunteersOver(500, 1_000, -1), 0);
  assertEquals(volunteersOver(500, 1_000, Number.NEGATIVE_INFINITY), 0);
});

Deno.test("a beta above one volunteers more often than a beta below it", () => {
  const eager = volunteersOver(500, 60_000, 10);
  const patient = volunteersOver(500, 60_000, 0.1);

  assert(eager > patient, `${eager} should exceed ${patient}`);
});

Deno.test("an infinite beta sends every reader at once", () => {
  assertEquals(
    volunteersOver(500, 60_000, Number.POSITIVE_INFINITY),
    1,
    "an unbounded window is the stampede the draw exists to prevent, and nothing refuses it",
  );
});

Deno.test({
  name: "every volunteering reader pays a lock round trip the algorithm never asked for",
  async fn() {
    const redis = installFakeRedis();

    try {
      const replicas = Array.from(
        { length: 50 },
        () => new RedisCache<string>({ key: "fleet", ttl: Duration.seconds(1) }),
      );
      redis.place(
        "fleet/k",
        encodeCacheEntry("stale", DateTime.now().millisecondsSinceEpoch + 5_000, 1_000_000),
        60_000,
      );
      redis.clear();

      await Promise.all(replicas.map((one) => one.upsert("k", () => Promise.resolve("fresh"))));
      await refreshesSettled();

      assertEquals(
        redis.countOf("set"),
        1,
        `fifty replicas reading one key took ${redis.countOf("set")} locks to let one of them refresh, so a ` +
          "read that hits doubles in cost the moment the draw opens",
      );
    } finally {
      redis.restore();
    }
  },
});

Deno.test({
  name: "a reader whose clock lags the writer stops volunteering altogether",
  fn() {
    const written = encodeCacheEntry("v", Date.now() + 11_000, 500);
    const read = decodeCacheEntry<string>(written, 1_000);
    assert(read !== null);

    let volunteered = 0;
    for (let reader = 0; reader < READERS; reader++) {
      if (shouldRefreshEarly(read, 1)) volunteered++;
    }

    assert(
      volunteered > 0,
      "a reader ten seconds behind the writer sees eleven seconds of life on a one second ttl, and an " +
        "absolute instant read as it comes turns refresh-ahead off for exactly that replica",
    );
  },
});

Deno.test({
  name: "an envelope whose numbers came back as text pins a value that never refreshes",
  fn() {
    const corrupt = decodeCacheEntry<string>('{"$k":1,"v":"v","e":"soon","d":"slow"}', 60_000);
    assert(corrupt !== null);

    assert(
      Number.isFinite(corrupt.expiresAt) && Number.isFinite(corrupt.computeMs),
      `the marker alone let this through, so expiresAt came back as ${typeof corrupt.expiresAt} and ` +
        `computeMs as ${typeof corrupt.computeMs}, and shouldRefreshEarly answers ` +
        `${shouldRefreshEarly(corrupt, 1, NOW)} for ever`,
    );
  },
});

Deno.test({
  name: "the reader that volunteers to refresh waits for the whole recompute",
  async fn() {
    const redis = installFakeRedis();

    try {
      const cache = new RedisCache<string>({ key: "waits", ttl: Duration.seconds(1) });
      redis.place(
        "waits/k",
        encodeCacheEntry("still good", DateTime.now().millisecondsSinceEpoch + 5_000, 1_000_000),
        60_000,
      );

      const started = Date.now();
      const answer = await cache.upsert("k", () => new Promise((done) => setTimeout(() => done("fresh"), 300)));
      const waited = Date.now() - started;
      await refreshesSettled();

      assertEquals(
        answer,
        "still good",
        `the reader that drew the refresh waited ${waited} ms for a value it already had, so the rule that ` +
          "exists so nobody waits on an expiry makes two readers in five wait the whole computation",
      );
    } finally {
      redis.restore();
    }
  },
});

Deno.test("a one second ttl is written whole, and the spread never rounds it away", () => {
  for (let draw = 0; draw < 500; draw++) {
    assertEquals(withJitter(Duration.seconds(1)), 1);
  }
});

Deno.test("the spread stays inside a tenth for every whole ttl a declaration is likely to name", () => {
  for (const seconds of [1, 2, 10, 60, 300, 86_400, 1_296_000]) {
    const ttl = Duration.seconds(seconds);
    for (let draw = 0; draw < 200; draw++) {
      const spread = withJitter(ttl);
      assert(spread >= seconds, `${spread} fell below the ttl of ${seconds}`);
      assert(spread <= seconds + Math.ceil(seconds * 0.1), `${spread} rose above a tenth of ${seconds}`);
      assert(Number.isInteger(spread), `${spread} is not a whole number of seconds`);
    }
  }
});

Deno.test("an entry already past its expiry is refreshed by whoever reads it", () => {
  assertEquals(volunteersOver(50, -1), 1);
});

Deno.test("a refresh that loses the lock serves what the reader already held", async () => {
  const redis = installFakeRedis();

  try {
    const cache = new RedisCache<string>({ key: "loser", ttl: Duration.minutes(5) });
    redis.place(
      "loser/k",
      encodeCacheEntry("held", DateTime.now().millisecondsSinceEpoch + 5_000, 1_000_000),
      60_000,
    );
    redis.place("lock:loser/k", "another replica refreshing", 60_000);
    let computed = 0;

    const answer = await cache.upsert("k", () => {
      computed++;
      return Promise.resolve("fresh");
    });

    assertEquals(answer, "held", "a refresh must never make a caller wait, it already has an answer");
    assertEquals(computed, 0);
  } finally {
    redis.restore();
  }
});

Deno.test("a frozen clock still lets a refresh decide, because the draw does not need time to pass", () => {
  const held = Now.get();
  Now.use(new FixedNow(NOW));

  try {
    const entry: CacheEntry<string> = { value: "v", expiresAt: NOW - 1, computeMs: 500 };
    assertEquals(shouldRefreshEarly(entry, 1), true);
  } finally {
    Now.use(held);
  }
});
