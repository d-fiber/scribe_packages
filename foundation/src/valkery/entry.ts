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
 * What a cache entry carries besides the value the caller stored.
 *
 * The two extra numbers are what early refresh needs, described in `early_expiry.ts`: when the
 * entry expires, and how long producing it took. Neither can be recovered from Redis after the
 * fact: `PTTL` costs a second round trip and says nothing about the cost of a recompute.
 */
export interface Entry<T> {
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
export function encodeEntry<T>(
  value: T,
  expiresAt: number,
  computeMs: number,
): string {
  return JSON.stringify({ $k: _KIND, v: value, e: expiresAt, d: computeMs });
}

/**
 * Reads what {@link encodeEntry} wrote, or `null` when the payload is unreadable.
 *
 * An entry written before this envelope existed is a bare JSON value. It is returned with
 * `computeMs` at zero, which reads as "nothing is known about the cost of a recompute" and
 * makes the early refresh of `early_expiry.ts` decline. Those entries age out on their own, so the
 * transition costs one TTL and no cold start.
 */
export function decodeEntry<T>(raw: string, ttlMs: number): Entry<T> | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isEnvelope(parsed)) {
    return { value: parsed as T, expiresAt: Date.now() + ttlMs, computeMs: 0 };
  }

  return {
    value: parsed.v as T,
    expiresAt: parsed.e,
    computeMs: parsed.d,
  };
}
