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

import type { Duration } from "@scribe/alchemy";
import { wholeMinutes } from "@scribe/foundation/lib/src/cron/core/duration.ts";

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
export function every(interval: Duration): IntervalSchedule {
  return { kind: "interval", ms: wholeMinutes("every()", interval).inMilliseconds };
}
