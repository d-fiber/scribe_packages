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
import "../../testing/settings.ts";
import "@scribe/runtime/scholium/runner.ts";
import { equals, expect, isFalse, isTrue, Scribe } from "@scribe/alchemy/test";
import { RedisClaims } from "../../../lib/src/redis/claim_once.ts";
import { installFakeRedis } from "./support/redis.ts";
import { installMock } from "../../testing/install.ts";

Scribe.test("the first caller on a free key takes the claim", async () => {
  const redis = installFakeRedis();
  try {
    const claims = new RedisClaims();
    const took = await claims.claim("lock:a", 30, { whenUnavailable: "refuse", scope: "test" });
    expect(took, isTrue);
  } finally {
    redis.restore();
  }
});

Scribe.test("a second caller on a key already claimed does not take it too", async () => {
  const redis = installFakeRedis();
  try {
    const claims = new RedisClaims();
    await claims.claim("lock:b", 30, { whenUnavailable: "refuse", scope: "test" });
    const took = await claims.claim("lock:b", 30, { whenUnavailable: "refuse", scope: "test" });
    expect(took, isFalse);
  } finally {
    redis.restore();
  }
});

Scribe.test("the claim reaches the store with SET key NX EX ttlSeconds", async () => {
  const redis = installFakeRedis();
  try {
    const claims = new RedisClaims();
    await claims.claim("lock:c", 45, { whenUnavailable: "refuse", scope: "test" });
    expect(redis.countOf("set"), equals(1));
    expect(redis.ttlOf("lock:c"), equals(45));
  } finally {
    redis.restore();
  }
});

Scribe.test("once the ttl has passed, a new caller can take the same key again", async () => {
  const redis = installFakeRedis();
  try {
    const claims = new RedisClaims();
    await claims.claim("lock:d", -1, { whenUnavailable: "refuse", scope: "test" });
    const took = await claims.claim("lock:d", 30, { whenUnavailable: "refuse", scope: "test" });
    expect(took, isTrue, "a claim whose ttl already elapsed must not still be held");
  } finally {
    redis.restore();
  }
});

Scribe.test("an unreachable store refuses the claim when whenUnavailable is refuse", async () => {
  const redis = installFakeRedis();
  const silenced = installMock(console, "error", () => {});
  try {
    redis.failNext("set", new Error("ECONNREFUSED"));
    const claims = new RedisClaims();
    const took = await claims.claim("lock:e", 30, { whenUnavailable: "refuse", scope: "test" });
    expect(took, isFalse);
  } finally {
    silenced.restore();
    redis.restore();
  }
});

Scribe.test("an unreachable store allows the claim when whenUnavailable is allow", async () => {
  const redis = installFakeRedis();
  const silenced = installMock(console, "error", () => {});
  try {
    redis.failNext("set", new Error("ECONNREFUSED"));
    const claims = new RedisClaims();
    const took = await claims.claim("lock:f", 30, { whenUnavailable: "allow", scope: "test" });
    expect(took, isTrue);
  } finally {
    silenced.restore();
    redis.restore();
  }
});

Scribe.test("a store failure is logged under the scope the caller named", async () => {
  const redis = installFakeRedis();
  const messages: unknown[][] = [];
  const silenced = installMock(console, "error", (...args: unknown[]) => {
    messages.push(args);
  });
  try {
    redis.failNext("set", new Error("ECONNREFUSED"));
    const claims = new RedisClaims();
    await claims.claim("lock:g", 30, { whenUnavailable: "allow", scope: "sign-in" });
    expect(messages.length, equals(1));
    expect(String(messages[0][0]).includes("sign-in"), isTrue);
  } finally {
    silenced.restore();
    redis.restore();
  }
});
