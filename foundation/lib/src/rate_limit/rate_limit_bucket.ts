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
    const subject = [prefix, key, _escaped(suffix)]
      .filter((segment) => segment.length > 0)
      .join(":");

    this.blockedKey = `rl:blocked:${subject}`;
    this.arrivalKey = `rl:tat:${subject}`;
    this.strikesKey = `rl:strikes:${subject}`;
  }
}

/**
 * The suffix of a bucket key, with the separator neutralised inside it.
 *
 * @remarks
 * Only this segment is escaped. The prefix and the declared name are literals a call site wrote,
 * and colons in them are the structure they meant, which is why `sign-in:email` reads as itself.
 * The suffix carries whatever the caller was counted against, so left as it comes
 * `("api", "read", "user:42")` and `("api", "read:user", "42")` produce the same key: one
 * declaration's penalty blocks the other's callers, and a caller choosing its own suffix chooses
 * which bucket it spends.
 */
function _escaped(segment: string): string {
  return segment.includes("\\") || segment.includes(":")
    ? segment.replaceAll("\\", "\\\\").replaceAll(":", "\\:")
    : segment;
}
