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
// LICENSE file, the LICENSE file governs.

import { Duration } from "@scribe/alchemy";
import { kv } from "@scribe/foundation/lib/src/redis/mod.ts";
import {
  type RateLimitCommands,
  RedisRateLimiter,
} from "@scribe/foundation/lib/src/rate_limit/mod.ts";
import { installMock } from "@scribe/core/testing/install.ts";
import { assertEquals } from "@std/assert";

const POLICY = {
  limit: 3,
  window: Duration.seconds(90),
  penalty: Duration.seconds(90),
};
const ALLOWED: [number, number, number, number] = [1, 2, 0, 0];

interface Recorder {
  readonly blockedKeys: string[];
  readonly ceilings: number[];
  restore(): void;
}

function recordCalls(
  answer: [number, number, number, number] = ALLOWED,
): Recorder {
  const blockedKeys: string[] = [];
  const ceilings: number[] = [];
  const mock = installMock(
    kv() as unknown as RateLimitCommands,
    "rateLimitCheck",
    ((
      blockedKey: string,
      _arrivalKey: string,
      _strikesKey: string,
      _limit: number,
      _window: number,
      _penalty: number,
      maxPenalty: number,
    ) => {
      blockedKeys.push(blockedKey);
      ceilings.push(maxPenalty);
      return Promise.resolve(answer);
    }) as unknown as RateLimitCommands["rateLimitCheck"],
  );
  return { blockedKeys, ceilings, restore: () => mock.restore() };
}

Deno.test("a call with no segments uses the one bucket everybody shares", async () => {
  const limit = new RedisRateLimiter({ key: "sign-in:email", ...POLICY });
  const calls = recordCalls();

  try {
    assertEquals(await limit.check(), { ok: true, remaining: 2 });
  } finally {
    calls.restore();
  }

  assertEquals(calls.blockedKeys, ["rl:blocked:sign-in:email"]);
});

Deno.test("a suffix gives each caller its own bucket", async () => {
  const limit = new RedisRateLimiter({ key: "sign-in:email", ...POLICY });
  const calls = recordCalls();

  try {
    await limit.check("", "1.2.3.4");
    await limit.check("", "5.6.7.8");
  } finally {
    calls.restore();
  }

  assertEquals(calls.blockedKeys, [
    "rl:blocked:sign-in:email:1.2.3.4",
    "rl:blocked:sign-in:email:5.6.7.8",
  ]);
});

Deno.test("a prefix keeps two mounts of one limit apart", async () => {
  const limit = new RedisRateLimiter({ key: "brand", ...POLICY });
  const calls = recordCalls();

  try {
    await limit.check("admin", "1.2.3.4");
    await limit.check("app", "1.2.3.4");
  } finally {
    calls.restore();
  }

  assertEquals(calls.blockedKeys, [
    "rl:blocked:admin:brand:1.2.3.4",
    "rl:blocked:app:brand:1.2.3.4",
  ]);
});

Deno.test("a limit never reads the request scope to name a bucket", async () => {
  const limit = new RedisRateLimiter({ key: "cron:sweep", ...POLICY });
  const calls = recordCalls();

  try {
    assertEquals(await limit.check(), { ok: true, remaining: 2 });
  } finally {
    calls.restore();
  }

  assertEquals(
    calls.blockedKeys,
    ["rl:blocked:cron:sweep"],
    "no request is open, and none is needed",
  );
});

Deno.test("a limit that measures nothing refuses nobody", async () => {
  const limit = new RedisRateLimiter({
    key: "misdeclared",
    limit: 0,
    window: Duration.seconds(0),
    penalty: Duration.seconds(0),
  });
  const calls = recordCalls();

  try {
    assertEquals(await limit.check(), { ok: true, remaining: 0 });
  } finally {
    calls.restore();
  }

  assertEquals(
    calls.blockedKeys,
    [],
    "a policy that measures nothing never reaches Redis",
  );
});

Deno.test("a declaration hands its ceiling to the script untouched", async () => {
  const limit = new RedisRateLimiter({
    key: "sign-up:user",
    ...POLICY,
    maxPenalty: Duration.days(1),
  });
  const calls = recordCalls();

  try {
    await limit.check("", "1.2.3.4");
  } finally {
    calls.restore();
  }

  assertEquals(
    calls.ceilings,
    [Duration.days(1).inSeconds],
    "capping a shared address is the caller's call, not this class's",
  );
});

Deno.test("a refused hit carries the wait and the strikes behind it", async () => {
  const limit = new RedisRateLimiter({ key: "sign-in:email", ...POLICY });
  const calls = recordCalls([0, 0, 900, 3]);

  try {
    assertEquals(await limit.check(), {
      ok: false,
      retryAfter: 900,
      strikes: 3,
    });
  } finally {
    calls.restore();
  }
});

Deno.test("a hit Redis refuses to answer falls back on the declaration", async () => {
  const open = new RedisRateLimiter({ key: "discover:feed", ...POLICY });
  const closed = new RedisRateLimiter({
    key: "sign-in:email",
    ...POLICY,
    failOpen: false,
  });
  const mock = installMock(
    kv() as unknown as RateLimitCommands,
    "rateLimitCheck",
    (() =>
      Promise.reject(new Error("redis down"))) as unknown as RateLimitCommands[
        "rateLimitCheck"
      ],
  );

  try {
    assertEquals(await open.check(), { ok: true, remaining: 3 });
    assertEquals(await closed.check(), {
      ok: false,
      retryAfter: 90,
      strikes: 0,
    });
  } finally {
    mock.restore();
  }
});

Deno.test("a peek reads the block without recording a hit", async () => {
  const limit = new RedisRateLimiter({ key: "sign-in:email", ...POLICY });
  const calls = recordCalls();
  const pttl = installMock(kv(), "pttl", () => Promise.resolve(4_200));

  try {
    assertEquals(await limit.isBlocked("", "hash-one"), true);
  } finally {
    pttl.restore();
    calls.restore();
  }

  assertEquals(
    calls.blockedKeys,
    [],
    "a peek never reaches the script that records",
  );
});

Deno.test("a peek answers false when no penalty is running", async () => {
  const limit = new RedisRateLimiter({ key: "sign-in:email", ...POLICY });
  const pttl = installMock(kv(), "pttl", () => Promise.resolve(-2));

  try {
    assertEquals(await limit.isBlocked("", "hash-one"), false);
  } finally {
    pttl.restore();
  }
});

Deno.test("a peek that cannot reach Redis answers what the declaration decided", async () => {
  const closed = new RedisRateLimiter({
    key: "sign-in:email",
    ...POLICY,
    failOpen: false,
  });
  const open = new RedisRateLimiter({
    key: "discover:feed",
    ...POLICY,
    failOpen: true,
  });
  const pttl = installMock(
    kv(),
    "pttl",
    () => Promise.reject(new Error("redis down")),
  );

  try {
    assertEquals(
      await closed.isBlocked(),
      true,
      "a credential guard refuses what it cannot measure",
    );
    assertEquals(
      await open.isBlocked(),
      false,
      "a capacity guard does not become an outage",
    );
  } finally {
    pttl.restore();
  }
});
