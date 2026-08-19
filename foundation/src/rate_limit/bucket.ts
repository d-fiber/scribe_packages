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

/**
 * The three Redis keys one rate limit bucket writes under.
 *
 * They are separate keys rather than fields of one hash because each carries its own expiry, and
 * because only the first exists in the common case: a caller under its limit leaves one timestamp
 * behind and nothing else. The block and the strike count are written the moment someone goes
 * over, and they expire on their own.
 */
export class RateLimitBucket {
  /** The key that exists only while this bucket is serving a penalty. */
  readonly blockedKey: string;

  /** The theoretical arrival time, which is the whole of the shaping state. */
  readonly arrivalKey: string;

  /** How many penalties this bucket has earned, which decides how long the next one lasts. */
  readonly strikesKey: string;

  constructor(prefix: string, key: string, suffix: string) {
    const subject = [prefix, key, suffix].filter((segment) => segment.length > 0).join(":");

    this.blockedKey = `rl:blocked:${subject}`;
    this.arrivalKey = `rl:tat:${subject}`;
    this.strikesKey = `rl:strikes:${subject}`;
  }
}
