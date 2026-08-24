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

import { Duration } from "@scribe/alchemy";
import type { RateLimitOutcome } from "@scribe/alchemy";
import { installDrivers } from "@scribe/foundation/tests/testing/drivers.ts";
import { kv } from "@scribe/foundation/lib/src/redis/kv.ts";
import { RateLimitBucket } from "@scribe/foundation/lib/src/rate_limit/rate_limit_bucket.ts";
import type { RateLimitCommands } from "@scribe/foundation/lib/src/rate_limit/rate_limit_commands.ts";
import { RedisRateLimiter } from "@scribe/foundation/lib/src/rate_limit/redis_rate_limiter.ts";
import { installMock } from "@scribe/foundation/tests/testing/install.ts";
import { assert, assertEquals } from "@std/assert";

const POLICY = {
  limit: 5,
  window: Duration.minutes(1),
  penalty: Duration.minutes(5),
};

interface Watched {
  readonly calls: unknown[][];
  restore(): void;
}

function answering(answer: unknown): Watched {
  const calls: unknown[][] = [];
  const mock = installMock(
    kv() as unknown as RateLimitCommands,
    "rateLimitCheck",
    ((...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve(answer);
    }) as unknown as RateLimitCommands["rateLimitCheck"],
  );
  return { calls, restore: () => mock.restore() };
}

const logged = installDrivers();

Deno.test({
  name: "a limit that refuses what it cannot measure lets everybody through when it is misdeclared",
  async fn() {
    const guard = new RedisRateLimiter({
      key: "sign-in:email",
      limit: 0,
      window: Duration.minutes(1),
      penalty: Duration.minutes(5),
      failOpen: false,
    });
    const script = answering([1, 4, 0, 0]);

    try {
      assertEquals(
        await guard.check("", "1.2.3.4"),
        guard.unmeasured(),
        "the declaration said refuse what you cannot measure, the class decided it could not measure, "
          + "and it answered allow, having never reached Redis",
      );
      assertEquals(script.calls.length, 0);
    } finally {
      script.restore();
    }
  },
});

Deno.test({
  name: "a limit whose count is not a number lets everybody through and hands out an allowance of NaN",
  async fn() {
    const guard = new RedisRateLimiter({ key: "typo", ...POLICY, limit: Number.NaN, failOpen: false });
    const script = answering([1, 4, 0, 0]);

    try {
      const answer = await guard.check();

      assertEquals(answer.ok, false, "a count nobody can read is a limit nobody can measure");
      assert(
        !answer.ok || Number.isFinite(answer.remaining),
        `the caller was handed remaining=${(answer as { remaining: number }).remaining}`,
      );
    } finally {
      script.restore();
    }
  },
});

Deno.test({
  name: "a negative count is handed to the caller as a negative allowance",
  async fn() {
    const guard = new RedisRateLimiter({ key: "negative", ...POLICY, limit: -1 });
    const script = answering([1, 4, 0, 0]);

    try {
      const answer = await guard.check();

      assert(answer.ok && answer.remaining >= 0, `the caller was told it had ${JSON.stringify(answer)}`);
    } finally {
      script.restore();
    }
  },
});

Deno.test({
  name: "a script that answers half a tuple is read as an allow with no allowance in it",
  async fn() {
    const guard = new RedisRateLimiter({ key: "half", ...POLICY, failOpen: false });
    const script = answering([1]);

    try {
      const answer = await guard.check();

      assert(
        !answer.ok || Number.isFinite(answer.remaining),
        `a store that answered ${JSON.stringify([1])} produced ${JSON.stringify(answer)}, and only a reply `
          + "that is not a list at all ever reaches the catch",
      );
    } finally {
      script.restore();
    }
  },
});

Deno.test({
  name: "a script that answers an empty list refuses with no wait to hand the caller",
  async fn() {
    const guard = new RedisRateLimiter({ key: "nothing", ...POLICY });
    const script = answering([]);

    try {
      const answer = await guard.check();

      assert(
        answer.ok || Number.isFinite(answer.retryAfter),
        `the caller was refused and told to come back after ${JSON.stringify(answer)}, which sends it round `
          + "again at once",
      );
    } finally {
      script.restore();
    }
  },
});

Deno.test({
  name: "numbers that come back as text turn every allowed hit into a refusal",
  async fn() {
    const guard = new RedisRateLimiter({ key: "text", ...POLICY });
    const script = answering(["1", "4", "0", "0"]);

    try {
      assertEquals(
        (await guard.check()).ok,
        true,
        "the comparison is strict, so a reply carrying the right numbers as text refuses every caller and "
          + "tells each of them to come back after zero seconds",
      );
    } finally {
      script.restore();
    }
  },
});

Deno.test("a reply that is not a list at all falls back on the declaration", async () => {
  const closed = new RedisRateLimiter({ key: "closed", ...POLICY, failOpen: false });
  const open = new RedisRateLimiter({ key: "open", ...POLICY });
  const script = answering(null);
  logged.clear();

  try {
    assertEquals(await closed.check(), { ok: false, retryAfter: 60, strikes: 0 });
    assertEquals(await open.check(), { ok: true, remaining: 5 });
    assert(logged.actions.filter((one) => one === "rate-limit.check_failed").length === 2);
  } finally {
    script.restore();
  }
});

Deno.test("a store that fails on one call is asked again on the next", async () => {
  const guard = new RedisRateLimiter({ key: "flaky", ...POLICY });
  let asked = 0;
  const mock = installMock(
    kv() as unknown as RateLimitCommands,
    "rateLimitCheck",
    ((() => {
      asked++;
      return asked === 1 ? Promise.reject(new Error("no redis")) : Promise.resolve([1, 4, 0, 0]);
    }) as unknown) as RateLimitCommands["rateLimitCheck"],
  );

  try {
    assertEquals(await guard.check(), { ok: true, remaining: 5 });
    assertEquals(await guard.check(), { ok: true, remaining: 4 });
    assertEquals(asked, 2, "an outage must not latch");
  } finally {
    mock.restore();
  }
});

Deno.test({
  name: "a penalty longer than the ceiling is cut down without a word",
  async fn() {
    const guard = new RedisRateLimiter({ key: "week", ...POLICY, penalty: Duration.days(7) });
    const script = answering([1, 4, 0, 0]);
    logged.clear();

    try {
      await guard.check();
      const [, , , , , penalty, ceiling] = script.calls[0] as number[];

      assert(
        penalty <= ceiling,
        `the declaration asked for ${penalty} seconds and the script will grant ${ceiling}, and nothing `
          + "between the two says so",
      );
    } finally {
      script.restore();
    }
  },
});

Deno.test({
  name: "a penalty longer than the strike memory defeats the escalation it belongs to",
  async fn() {
    const guard = new RedisRateLimiter({
      key: "forgetful",
      ...POLICY,
      penalty: Duration.hours(2),
      strikeMemory: Duration.hours(1),
    });
    const script = answering([1, 4, 0, 0]);

    try {
      await guard.check();
      const [, , , , , penalty, , memory] = script.calls[0] as number[];

      assert(
        penalty < memory,
        `a block of ${penalty} seconds outlives a strike count kept for ${memory}, so the count is gone by `
          + "the time the block lifts and the next penalty starts over at the first",
      );
    } finally {
      script.restore();
    }
  },
});

Deno.test({
  name: "two declarations that differ only in where the colon falls share one bucket",
  fn() {
    const mounted = new RateLimitBucket("api", "read", "user:42");
    const declared = new RateLimitBucket("api", "read:user", "42");

    assert(
      mounted.blockedKey !== declared.blockedKey,
      `both name ${mounted.blockedKey}, so one declaration's penalty blocks the other's callers, and a `
        + "suffix a caller controls decides which bucket it spends",
    );
  },
});

Deno.test("a bucket is the same for the same three segments and different for any other", () => {
  assertEquals(
    new RateLimitBucket("api", "read", "42").blockedKey,
    new RateLimitBucket("api", "read", "42").blockedKey,
  );
  assert(
    new RateLimitBucket("api", "read", "42").blockedKey !==
      new RateLimitBucket("api", "read", "43").blockedKey,
  );
});

Deno.test("a suffix of ten thousand characters is passed through untouched", async () => {
  const guard = new RedisRateLimiter({ key: "long", ...POLICY });
  const script = answering([1, 4, 0, 0]);

  try {
    await guard.check("", "y".repeat(10_000));

    assertEquals((script.calls[0][0] as string).length, "rl:blocked:long:".length + 10_000);
  } finally {
    script.restore();
  }
});

Deno.test("a window of one millisecond still reaches the script, with the fraction it was given", async () => {
  const guard = new RedisRateLimiter({
    key: "tiny",
    limit: 10,
    window: Duration.milliseconds(1),
    penalty: Duration.milliseconds(1),
  });
  const script = answering([1, 9, 0, 0]);

  try {
    await guard.check();
    const [, , , limit, window, penalty] = script.calls[0] as number[];

    assertEquals([limit, window, penalty], [10, 0.001, 0.001]);
  } finally {
    script.restore();
  }
});

Deno.test({
  name: "a peek reaches Redis for a limit that check refuses to measure",
  async fn() {
    const broken = new RedisRateLimiter({
      key: "misdeclared",
      limit: 0,
      window: Duration.seconds(0),
      penalty: Duration.seconds(0),
      failOpen: false,
    });
    let asked = 0;
    const mock = installMock(kv(), "pttl", () => {
      asked++;
      return Promise.resolve(-2);
    });

    try {
      await broken.isBlocked();

      assertEquals(
        asked,
        0,
        "check decides this limit measures nothing and never leaves the process, and the peek beside it "
          + "goes to Redis anyway",
      );
    } finally {
      mock.restore();
    }
  },
});

Deno.test("a refused hit carries what the script measured, whatever it is", async () => {
  const guard = new RedisRateLimiter({ key: "refused", ...POLICY });
  const script = answering([0, 0, 900, 3]);

  try {
    assertEquals(await guard.check(), { ok: false, retryAfter: 900, strikes: 3 } satisfies RateLimitOutcome);
  } finally {
    script.restore();
  }
});

Deno.test("a burst of two hundred hits costs two hundred round trips and nothing else", async () => {
  const guard = new RedisRateLimiter({ key: "burst", ...POLICY });
  let spent = 0;
  const script = answering(null);
  script.restore();

  const mock = installMock(
    kv() as unknown as RateLimitCommands,
    "rateLimitCheck",
    ((() => {
      spent++;
      return Promise.resolve(spent <= 5 ? [1, 5 - spent, 0, 0] : [0, 0, 300, 1]);
    }) as unknown) as RateLimitCommands["rateLimitCheck"],
  );

  try {
    const answers = await Promise.all(Array.from({ length: 200 }, () => guard.check("", "1.2.3.4")));

    assertEquals(answers.filter((one) => one.ok).length, 5, "the burst is exactly the limit");
    assertEquals(spent, 200, "one hit, one round trip, whatever the answer");
  } finally {
    mock.restore();
  }
});
