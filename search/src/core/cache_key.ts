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

/** The offset basis and the prime of the 32-bit FNV-1a hash, which `digest` folds a string with. */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * `value` written so that two objects meaning the same thing write the same string.
 *
 * @remarks
 * Object keys are sorted, and an array holding nothing but scalars is sorted too, since a list
 * of statuses means the same whichever order a caller passed it in. An array holding objects
 * keeps its order, because there the order is usually the meaning.
 */
export function stableKey(value: unknown): string {
  return JSON.stringify(value, (_key, held: unknown) => {
    if (Array.isArray(held)) {
      return held.every((one) => typeof one !== "object" || one === null) ? [...held].sort() : held;
    }

    if (held && typeof held === "object") {
      return Object.keys(held)
        .sort()
        .reduce<Record<string, unknown>>((sorted, key) => {
          sorted[key] = (held as Record<string, unknown>)[key];
          return sorted;
        }, {});
    }

    return held;
  });
}

/**
 * A short digest of `value`, which changes when what it means changes.
 *
 * It compares a declaration against what the cluster was last told, so it detects a change and
 * guards nothing. A non-cryptographic fold is what that needs, and it costs one pass.
 */
export function digest(value: unknown): string {
  const written = stableKey(value);
  let hash = FNV_OFFSET;

  for (let i = 0; i < written.length; i++) {
    hash ^= written.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * `ms` rounded down to the start of its bucket.
 *
 * A cache key built on the current moment misses every time. Rounded to a bucket, every caller
 * inside the same bucket shares one entry, and the index is at most one bucket stale.
 */
export function timeBucket(ms: number, bucketMs: number): number {
  return Math.floor(ms / bucketMs) * bucketMs;
}

/**
 * `value` kept to `precision` decimals, which is what puts nearby callers on one cache entry.
 *
 * Two decimals is about a kilometre at the equator, three about a hundred metres.
 */
export function roundCoord(value: number, precision: number): number {
  return Number(value.toFixed(precision));
}
