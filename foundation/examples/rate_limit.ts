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

import { Duration, type Future, rateLimit } from "@scribe/alchemy";
import { SHARED_ADDRESS_MAX_PENALTY, SHARED_ADDRESS_STRIKE_MEMORY } from "../lib/src/rate_limit/redis_rate_limiter.ts";

/**
 * A limit that guards a credential, so an unmeasured caller is refused.
 *
 * `limit` and `window` are a burst and a rate at the same time: ten hits may be spent at once,
 * and one comes back every six seconds. Nothing empties on a boundary, so there is no second
 * worth waiting for.
 */
export const signIn = rateLimit({
  key: "sign-in:email",
  limit: 10,
  window: Duration.minutes(1),
  penalty: Duration.minutes(5),
  failOpen: false,
});

/**
 * A limit keyed on a network address, which punishes everyone behind it.
 *
 * An office, a campus and a mobile carrier all put thousands of people on one address, so the
 * penalty stops doubling early and the strikes are forgotten within the hour. Both values are
 * passed rather than applied by the class, because only the code that built the bucket knows
 * whether it named an account or an address.
 */
export const anonymousReads = rateLimit({
  key: "reads",
  limit: 300,
  window: Duration.minutes(1),
  penalty: Duration.minutes(1),
  maxPenalty: SHARED_ADDRESS_MAX_PENALTY,
  strikeMemory: SHARED_ADDRESS_STRIKE_MEMORY,
});

/**
 * Records one hit and says how many seconds to wait when it is refused.
 *
 * The two segments are the caller's to build: the prefix is what the limit is mounted under,
 * such as the node the request came in on, and the suffix is who the hit is counted against.
 * A call that passes neither uses the one bucket everybody shares, which protects the thing
 * behind the endpoint rather than the callers of it.
 */
export async function retryAfterSignIn(
  node: string,
  accountId: string,
): Future<number | null> {
  const outcome = await signIn.check(node, accountId);
  return outcome.ok ? null : outcome.retryAfter;
}

/**
 * Says whether a bucket is serving a penalty, without recording anything.
 *
 * It costs the caller no allowance, so it tells someone they are blocked without pushing
 * their release further away.
 */
export function isSignInBlocked(
  node: string,
  accountId: string,
): Future<boolean> {
  return signIn.isBlocked(node, accountId);
}
