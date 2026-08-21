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

import { type TriggerEventRow, triggerEvents } from "./tables.ts";

/**
 * How many outbox rows one pass takes.
 *
 * The batch is what bounds a pass, not a time budget: a burst leaves the rest in the table and
 * the next tick takes them, five hundred milliseconds later.
 */
export const DRAIN_BATCH = 200;

/**
 * The oldest outbox rows, by the order they were written.
 *
 * The read carries no cursor. A cursor on `id` would skip rows, because a transaction holding
 * the sequence value 99 can commit after the one holding 100, and everything below the highest
 * identifier seen would then be considered read. Here a row leaves the table when it has been
 * published, so what is still there is exactly what is still to do.
 */
export function pendingEvents(): Promise<TriggerEventRow[]> {
  return triggerEvents()
    .order("id", { ascending: true })
    .limit(DRAIN_BATCH)
    .get();
}

/** Forgets the rows that have been published, which is what claims them. */
export function forgetEvents(ids: readonly number[]): Promise<boolean> {
  return triggerEvents()
    .where((f) => f.id.in([...ids]))
    .delete();
}
