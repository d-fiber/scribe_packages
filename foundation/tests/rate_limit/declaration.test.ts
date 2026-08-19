// Copyright (C) 2026 Fiber
//
// This file is part of scribe and is made available under the PolyForm Shield
// License 1.0.0. The full terms are in the LICENSE file at the root of this
// repository, and at https://polyformproject.org/licenses/shield/1.0.0
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
//
// The one thing you may not do:
// - Use it to provide any product that competes with scribe, or with any
//   product Fiber or its affiliates provide using scribe. Products compete
//   even when they are offered free of charge, through a different kind of
//   interface, or for a different technical platform.
//
// If you pass this software on:
// - Anyone who receives any part of it from you must also receive these terms,
//   or the URL above, together with the "Required Notice" line carried by the
//   LICENSE file.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE COMES AS IS, WITHOUT ANY WARRANTY OR
// CONDITION, AND THE LICENSOR WILL NOT BE LIABLE TO YOU FOR ANY DAMAGES ARISING
// OUT OF THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY KIND OF
// LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

import { Time } from "@scribe/core/contracts/common/time.ts";
import { RateLimit, RateLimitBucket } from "@scribe/foundation/src/rate_limit/mod.ts";
import { assertEquals, assertNotEquals } from "@std/assert";

const POLICY = { limit: 10, window: Time.minutes(1), penalty: Time.minutes(5) };

Deno.test("a bucket derives its three keys from the segments it was given", () => {
  const bucket = new RateLimitBucket("admin", "sign-in", "1.2.3.4");

  assertEquals(bucket.blockedKey, "rl:blocked:admin:sign-in:1.2.3.4");
  assertEquals(bucket.arrivalKey, "rl:tat:admin:sign-in:1.2.3.4");
  assertEquals(bucket.strikesKey, "rl:strikes:admin:sign-in:1.2.3.4");
});

Deno.test("a bucket drops the segments it was not given", () => {
  assertEquals(new RateLimitBucket("", "sign-in", "").blockedKey, "rl:blocked:sign-in");
  assertEquals(new RateLimitBucket("", "sign-in", "1.2.3.4").blockedKey, "rl:blocked:sign-in:1.2.3.4");
  assertEquals(new RateLimitBucket("admin", "sign-in", "").blockedKey, "rl:blocked:admin:sign-in");
});

Deno.test("two suffixes never share a bucket key", () => {
  const one = new RateLimitBucket("", "sign-in", "1.2.3.4");
  const other = new RateLimitBucket("", "sign-in", "5.6.7.8");

  assertNotEquals(one.blockedKey, other.blockedKey);
  assertNotEquals(one.arrivalKey, other.arrivalKey);
  assertNotEquals(one.strikesKey, other.strikesKey);
});

Deno.test("a declaration keeps the policy it was given", () => {
  const limit = new RateLimit({ key: "sign-in:email", ...POLICY, failOpen: false });

  assertEquals(limit.key, "sign-in:email");
  assertEquals(limit.limit, 10);
  assertEquals(limit.window, Time.minutes(1));
  assertEquals(limit.penalty, Time.minutes(5));
  assertEquals(limit.failOpen, false);
});

Deno.test("a declaration that says nothing about an outage lets the caller through", () => {
  assertEquals(new RateLimit({ key: "discover:feed", ...POLICY }).failOpen, true);
});

Deno.test("a limit that cannot be measured answers what its declaration decided", () => {
  const open = new RateLimit({ key: "discover:feed", ...POLICY });
  const closed = new RateLimit({ key: "sign-in:email", ...POLICY, failOpen: false });

  assertEquals(open.unmeasured(), { ok: true, remaining: 10 });
  assertEquals(closed.unmeasured(), { ok: false, retryAfter: 60, strikes: 0 });
});
