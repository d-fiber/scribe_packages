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
