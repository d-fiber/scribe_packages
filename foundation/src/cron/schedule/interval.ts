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
import { wholeMinutes } from "@scribe/foundation/src/cron/core/duration.ts";

/** A job that runs every so often, with no regard for the calendar. */
export interface IntervalSchedule {
  /** What tells this schedule from the two calendar shapes. */
  readonly kind: "interval";

  /** Milliseconds between two occurrences, always a whole number of minutes' worth. */
  readonly ms: number;
}

/**
 * Runs the job once per `interval`.
 *
 * The interval has to be a whole number of minutes, and the refusal happens at declaration
 * rather than at the first occurrence. The reason is downstream: an occurrence is claimed
 * across replicas under a key derived from the interval, and a value that does not divide
 * into minutes rounds differently on two machines whose clocks differ slightly, so they would
 * claim two keys and the job would run twice.
 */
export function every(interval: Time): IntervalSchedule {
  return { kind: "interval", ms: wholeMinutes("every()", interval).ms };
}
