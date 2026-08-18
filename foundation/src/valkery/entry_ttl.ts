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

import type { Time } from "@scribe/core/contracts/common/time.ts";

/** How much of the ttl the spread is drawn from. */
const JITTER_RATIO = 0.1;

/**
 * The ttl an entry is actually written with, in seconds, spread out a little.
 *
 * Without the spread, everything written in the same second expires in the same second and
 * the recomputation departs as one wave. A tenth is enough to break the alignment without
 * making any entry meaningfully staler than it was asked to be.
 *
 * The result is never below the ttl asked for, and a ttl too small to spread is returned
 * untouched rather than rounded to nothing.
 */
export function withJitter(ttl: Time): number {
  const spread = Math.ceil(ttl.value * JITTER_RATIO);
  if (spread <= 0) return ttl.value;

  return ttl.value + Math.floor(Math.random() * spread);
}
