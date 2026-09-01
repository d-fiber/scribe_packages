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
import { kv } from "../../../lib/src/redis/kv.ts";
import { RateLimitBucket } from "../../../lib/src/rate_limit/rate_limit_bucket.ts";
import type { RateLimitCommands } from "../../../lib/src/rate_limit/rate_limit_commands.ts";
import {
  RedisRateLimiter,
  RedisRateLimiters,
  SHARED_ADDRESS_MAX_PENALTY,
  SHARED_ADDRESS_STRIKE_MEMORY,
} from "../../../lib/src/rate_limit/redis_rate_limiter.ts";
import { installMock } from "../../testing/install.ts";
const POLICY = {
  limit: 5,
  window: Duration.minutes(1),
  penalty: Duration.minutes(5),
};

function recordCalls(): { calls: unknown[][]; restore(): void } {
  const calls: unknown[][] = [];
  const mock = installMock(
    kv() as unknown as RateLimitCommands,
    "rateLimitCheck",
    ((...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve([1, 4, 0, 0]);
    }) as unknown as RateLimitCommands["rateLimitCheck"],
  );
  return { calls, restore: () => mock.restore() };
}

installDrivers();

Scribe.test("the driver opens a limiter bound to the options it was given", () => {
  const opened = new RedisRateLimiters().open({ key: "sign-in:email", ...POLICY, failOpen: false });

  expect(opened instanceof RedisRateLimiter, isTrue);
  const limiter = opened as RedisRateLimiter;
  expect(limiter.key, equals("sign-in:email"));
  expect(limiter.failOpen, equals(false));
});

Scribe.test("the shared address values are fifteen minutes and one hour", () => {
  expect(SHARED_ADDRESS_MAX_PENALTY, equals(Duration.minutes(15)));
  expect(SHARED_ADDRESS_STRIKE_MEMORY, equals(Duration.hours(1)));
});

Scribe.test("a declaration keyed on a network address keeps its penalty under the shared ceiling", async () => {
  const guard = new RedisRateLimiter({
    key: "reads",
    limit: 300,
    window: Duration.minutes(1),
    penalty: Duration.minutes(1),
    maxPenalty: SHARED_ADDRESS_MAX_PENALTY,
    strikeMemory: SHARED_ADDRESS_STRIKE_MEMORY,
  });
  const calls = recordCalls();

  try {
    expect(guard.penalty, equals(Duration.minutes(1)), "one minute is already under the fifteen-minute ceiling");
    await guard.check("edge", "1.2.3.4");
    const [, , , , , , ceiling, memory] = calls.calls[0] as number[];
    expect(ceiling, equals(SHARED_ADDRESS_MAX_PENALTY.inSeconds));
    expect(memory, equals(SHARED_ADDRESS_STRIKE_MEMORY.inSeconds));
  } finally {
    calls.restore();
  }
});

Scribe.test("a zero window measures nothing even with a real limit and penalty", async () => {
  const guard = new RedisRateLimiter({
    key: "no-window",
    limit: 5,
    window: Duration.seconds(0),
    penalty: Duration.minutes(1),
  });
  const calls = recordCalls();

  try {
    expect(await guard.check(), equals(guard.unmeasured()));
    expect(calls.calls, equals([]), "a policy that measures nothing never reaches the script");
  } finally {
    calls.restore();
  }
});

Scribe.test("a negative window measures nothing", async () => {
  const guard = new RedisRateLimiter({
    key: "negative-window",
    limit: 5,
    window: Duration.seconds(-1),
    penalty: Duration.minutes(1),
  });
  const calls = recordCalls();

  try {
    expect(await guard.check(), equals(guard.unmeasured()));
    expect(calls.calls, equals([]));
  } finally {
    calls.restore();
  }
});

Scribe.test("a zero penalty measures nothing even with a real limit and window", async () => {
  const guard = new RedisRateLimiter({
    key: "no-penalty",
    limit: 5,
    window: Duration.minutes(1),
    penalty: Duration.seconds(0),
  });
  const calls = recordCalls();

  try {
    expect(await guard.check(), equals(guard.unmeasured()));
    expect(calls.calls, equals([]));
  } finally {
    calls.restore();
  }
});

Scribe.test("a window that is not a number measures nothing", async () => {
  const guard = new RedisRateLimiter({
    key: "nan-window",
    limit: 5,
    window: Duration.seconds(Number.NaN),
    penalty: Duration.minutes(1),
  });
  const calls = recordCalls();

  try {
    expect(await guard.check(), equals(guard.unmeasured()));
    expect(calls.calls, equals([]));
  } finally {
    calls.restore();
  }
});

Scribe.test("a suffix carrying a literal backslash is escaped ahead of the separator it could forge", () => {
  const withBackslash = new RateLimitBucket("", "sign-in", "a\\b");
  const withColon = new RateLimitBucket("", "sign-in", "a:b");

  expect(withBackslash.blockedKey, equals("rl:blocked:sign-in:a\\\\b"));
  expect(withColon.blockedKey, equals("rl:blocked:sign-in:a\\:b"));
});

Scribe.test("a suffix escaped for one bucket never collides with the unescaped segments of another", () => {
  const forged = new RateLimitBucket("", "sign-in", "a:b");
  const distinctSegments = new RateLimitBucket("", "sign-in:a", "b");

  expect(
    forged.blockedKey !== distinctSegments.blockedKey,
    isTrue,
    `both would name ${forged.blockedKey} without escaping`,
  );
});
