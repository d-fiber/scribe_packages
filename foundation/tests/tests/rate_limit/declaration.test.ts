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
import { equals, expect, isNot, Scribe } from "@scribe/alchemy/test";
import { Duration } from "@scribe/alchemy";
import { RateLimitBucket } from "../../../lib/src/rate_limit/rate_limit_bucket.ts";
import { RedisRateLimiter } from "../../../lib/src/rate_limit/redis_rate_limiter.ts";
const POLICY = {
  limit: 10,
  window: Duration.minutes(1),
  penalty: Duration.minutes(5),
};

Scribe.test("a bucket derives its three keys from the segments it was given", () => {
  const bucket = new RateLimitBucket("admin", "sign-in", "1.2.3.4");

  expect(bucket.blockedKey, equals("rl:blocked:admin:sign-in:1.2.3.4"));
  expect(bucket.arrivalKey, equals("rl:tat:admin:sign-in:1.2.3.4"));
  expect(bucket.strikesKey, equals("rl:strikes:admin:sign-in:1.2.3.4"));
});

Scribe.test("a bucket drops the segments it was not given", () => {
  expect(new RateLimitBucket("", "sign-in", "").blockedKey, equals("rl:blocked:sign-in"));
  expect(new RateLimitBucket("", "sign-in", "1.2.3.4").blockedKey, equals("rl:blocked:sign-in:1.2.3.4"));
  expect(new RateLimitBucket("admin", "sign-in", "").blockedKey, equals("rl:blocked:admin:sign-in"));
});

Scribe.test("two suffixes never share a bucket key", () => {
  const one = new RateLimitBucket("", "sign-in", "1.2.3.4");
  const other = new RateLimitBucket("", "sign-in", "5.6.7.8");

  expect(one.blockedKey, isNot(equals(other.blockedKey)));
  expect(one.arrivalKey, isNot(equals(other.arrivalKey)));
  expect(one.strikesKey, isNot(equals(other.strikesKey)));
});

Scribe.test("a declaration keeps the policy it was given", () => {
  const limit = new RedisRateLimiter({
    key: "sign-in:email",
    ...POLICY,
    failOpen: false,
  });

  expect(limit.key, equals("sign-in:email"));
  expect(limit.limit, equals(10));
  expect(limit.window, equals(Duration.minutes(1)));
  expect(limit.penalty, equals(Duration.minutes(5)));
  expect(limit.failOpen, equals(false));
});

Scribe.test("a declaration that says nothing about an outage lets the caller through", () => {
  expect(new RedisRateLimiter({ key: "discover:feed", ...POLICY }).failOpen, equals(true));
});

Scribe.test("a limit that cannot be measured answers what its declaration decided", () => {
  const open = new RedisRateLimiter({ key: "discover:feed", ...POLICY });
  const closed = new RedisRateLimiter({
    key: "sign-in:email",
    ...POLICY,
    failOpen: false,
  });

  expect(open.unmeasured(), equals({ ok: true, remaining: 10 }));
  expect(closed.unmeasured(), equals({ ok: false, retryAfter: 60, strikes: 0 }));
});
