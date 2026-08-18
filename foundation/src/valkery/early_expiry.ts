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

import type { Entry } from "./entry.ts";

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
  entry: Entry<unknown>,
  beta: number,
  now: number = Date.now(),
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
