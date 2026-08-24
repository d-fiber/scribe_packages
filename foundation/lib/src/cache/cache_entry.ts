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

/**
 * What a cache entry carries besides the value the caller stored.
 *
 * The two extra numbers are what early refresh needs, described in `early_expiry.ts`: when the
 * entry expires, and how long producing it took. Neither can be recovered from Redis after the
 * fact: `PTTL` costs a second round trip and says nothing about the cost of a recompute.
 */
export interface CacheEntry<out T> {
  /** The value the caller stored, as it was given. */
  readonly value: T;

  /** Epoch milliseconds at which this entry stops being served. */
  readonly expiresAt: number;
  /** Milliseconds the computation that produced this value took. */
  readonly computeMs: number;
}

/**
 * The marker that tells an envelope apart from a value written before envelopes existed.
 *
 * A cached value is arbitrary JSON, so the shape has to be one a domain object will not
 * have by accident. Anything without this exact marker is read as a bare legacy value.
 */
const _KIND = 1;

interface Envelope {
  readonly $k: typeof _KIND;
  readonly v: unknown;
  readonly e: number;
  readonly d: number;
}

function isEnvelope(parsed: unknown): parsed is Envelope {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as Envelope).$k === _KIND
  );
}

/** Serializes a value and the two numbers that let a reader refresh it early. */
export function encodeCacheEntry<T>(
  value: T,
  expiresAt: number,
  computeMs: number,
): string {
  return JSON.stringify({ $k: _KIND, v: value, e: expiresAt, d: computeMs });
}

/**
 * Reads what {@link encodeCacheEntry} wrote, or `null` when the payload is unreadable or spent.
 *
 * An envelope that says it expired is nothing, whatever the store still holds. Redis drops the key
 * itself in the common case, so this is what answers when it did not: a store that lost its expiry
 * on a restart, a replica whose clock runs behind the writer's, or a double a test put behind the
 * port. The port promises an entry past its ttl is gone, and it is the reader that keeps it.
 *
 * An entry written before this envelope existed is a bare JSON value. It is returned with
 * `computeMs` at zero, which reads as "nothing is known about the cost of a recompute" and
 * makes the early refresh of `early_expiry.ts` decline. Those entries age out on their own, so the
 * transition costs one TTL and no cold start.
 *
 * An envelope claiming more life than the ttl allows is read down to the ttl. It is what a reader
 * whose clock runs behind the writer's sees, and left alone it turns the early refresh off on
 * exactly that replica: every read looks far from an expiry that is in fact minutes away. A
 * number that came back as text is read the same way, as the value it would have had.
 */
export function decodeCacheEntry<T>(raw: string, ttlMs: number): CacheEntry<T> | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isEnvelope(parsed)) {
    return {
      value: parsed as T,
      expiresAt: DateTime.now().millisecondsSinceEpoch + ttlMs,
      computeMs: 0,
    };
  }

  const now = DateTime.now().millisecondsSinceEpoch;
  const expiresAt = _finite(parsed.e, now + ttlMs);
  if (expiresAt <= now) return null;

  return {
    value: parsed.v as T,
    expiresAt: Math.min(expiresAt, now + ttlMs),
    computeMs: Math.max(0, _finite(parsed.d, 0)),
  };
}

/**
 * `held` as a number, or `fallback` when it is not one.
 *
 * @remarks
 * The marker says the payload was written by this package, and says nothing about what a store,
 * a proxy or a hand-edited key did to the two numbers since. A `NaN` in either of them pins the
 * entry: the comparison against the clock is false whichever way it is written, so the value is
 * served for ever and never refreshed.
 */
function _finite(held: unknown, fallback: number): number {
  const read = typeof held === "number" ? held : Number(held);
  return Number.isFinite(read) ? read : fallback;
}
