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

import { DateTime } from "@scribe/alchemy";
import type { CacheEntry } from "./cache_entry.ts";

/**
 * How aggressively a reader volunteers to refresh an entry before it expires.
 *
 * One is the value the original paper settles on. Above one the cache refreshes earlier and
 * more often, below one it waits longer and lets more readers reach the expiry together.
 */
export const DEFAULT_BETA = 1;

/**
 * Whether this reader should recompute an entry that has not expired yet.
 *
 * This is the "optimal probabilistic cache stampede prevention" rule: a reader draws
 * `computeMs × beta × -ln(random)` and refreshes when that window reaches the expiry. The
 * draw is unbiased, so across a fleet exactly the readers of one key volunteer, and they
 * volunteer earlier as the expiry approaches.
 *
 * What makes it worth preferring to a lock is that the window scales with the cost of the
 * computation. A value that takes four milliseconds to produce opens a window of a few
 * milliseconds and behaves as if this did not exist; a geocoding call that takes half a
 * second opens a window wide enough that nobody ever waits on an expired key.
 *
 * An entry with `computeMs` at zero never refreshes early. That is what a legacy entry
 * carries, and a computation too fast to measure has nothing to gain here either.
 */
export function shouldRefreshEarly(
  entry: CacheEntry<unknown>,
  beta: number,
  now: number = DateTime.now().millisecondsSinceEpoch,
): boolean {
  if (entry.computeMs <= 0 || beta <= 0) return false;

  return now + entry.computeMs * beta * -Math.log(_draw()) >= entry.expiresAt;
}

/**
 * A draw in `(0, 1]`, never exactly zero.
 *
 * `Math.random()` can return exactly zero, and `-ln(0)` is infinite: such a draw would send
 * every reader refreshing at once, which is the stampede {@link shouldRefreshEarly} exists
 * to prevent.
 */
function _draw(): number {
  const drawn = Math.random();
  return drawn > 0 ? drawn : Number.MIN_VALUE;
}
