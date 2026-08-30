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
import { RedisRateLimiter } from "../../../lib/src/rate_limit/redis_rate_limiter.ts";
import { installMock } from "../../testing/install.ts";
const POLICY = {
  limit: 5,
  window: Duration.minutes(1),
  penalty: Duration.minutes(5),
};
const WARMUP = 20_000;
const ROUNDS = 100_000;

function nanosecondsPer(rounds: number, body: () => void): number {
  for (let round = 0; round < rounds / 10; round++) body();
  const started = performance.now();
  for (let round = 0; round < rounds; round++) body();
  return (performance.now() - started) * 1e6 / rounds;
}

installDrivers();

Scribe.test("one hit costs one round trip, whether it is allowed or refused", async () => {
  const guard = new RedisRateLimiter({ key: "cost", ...POLICY });
  let reached = 0;
  const mock = installMock(
    kv() as unknown as RateLimitCommands,
    "rateLimitCheck",
    ((() => {
      reached++;
      return Promise.resolve(reached % 2 === 0 ? [1, 4, 0, 0] : [0, 0, 300, 1]);
    }) as unknown) as RateLimitCommands["rateLimitCheck"],
  );

  try {
    for (let round = 0; round < WARMUP; round++) await guard.check("api", "1.2.3.4");
    expect(reached, equals(WARMUP));

    const started = performance.now();
    for (let round = 0; round < ROUNDS; round++) await guard.check("api", "1.2.3.4");
    console.log(
      `check: ${((performance.now() - started) * 1e6 / ROUNDS).toFixed(0)} ns of this process per call`,
    );
  } finally {
    mock.restore();
  }
});

Scribe.test("a peek costs one round trip and never the script", async () => {
  const guard = new RedisRateLimiter({ key: "peek", ...POLICY });
  let peeked = 0;
  let scripted = 0;
  const pttl = installMock(kv(), "pttl", () => {
    peeked++;
    return Promise.resolve(-2);
  });
  const script = installMock(
    kv() as unknown as RateLimitCommands,
    "rateLimitCheck",
    ((() => {
      scripted++;
      return Promise.resolve([1, 4, 0, 0]);
    }) as unknown) as RateLimitCommands["rateLimitCheck"],
  );

  try {
    for (let round = 0; round < 1_000; round++) await guard.isBlocked("api", "1.2.3.4");

    expect(peeked, equals(1_000));
    expect(
      scripted,
      equals(0),
      "a peek that recorded a hit would make telling someone they are blocked " +
        "extend the block",
    );
  } finally {
    script.restore();
    pttl.restore();
  }
});

Scribe.test("naming a bucket costs three strings and one pass over three segments", () => {
  const built = nanosecondsPer(1_000_000, () => {
    new RateLimitBucket("api", "sign-in:email", "1.2.3.4");
  });

  console.log(`RateLimitBucket: ${built.toFixed(0)} ns per hit`);
  expect(new RateLimitBucket("api", "sign-in:email", "1.2.3.4").arrivalKey, equals("rl:tat:api:sign-in:email:1.2.3.4"));
  expect(built < 1_000, isTrue, `naming a bucket took ${built} ns, which is paid on every hit of every endpoint`);
});

Scribe.test("reading the four durations a hit hands the script costs nothing worth caching", () => {
  const guard = new RedisRateLimiter({ key: "durations", ...POLICY });
  const read = nanosecondsPer(5_000_000, () => {
    void (guard.window.inSeconds + guard.penalty.inSeconds + guard.limit);
  });

  console.log(`three of the numbers a hit reads: ${read.toFixed(1)} ns`);
  expect(read < 100, isTrue, `${read} ns, which is why holding them as numbers on the declaration would buy nothing`);
});

Scribe.test("the whole state of a bucket under its limit is one key", () => {
  const bucket = new RateLimitBucket("", "sign-in:email", "1.2.3.4");

  expect(bucket.arrivalKey, equals("rl:tat:sign-in:email:1.2.3.4"));
  expect(
    bucket.blockedKey !== bucket.arrivalKey && bucket.strikesKey !== bucket.arrivalKey,
    isTrue,
    "the other two are written only once somebody goes over, and they expire on their own",
  );
});
