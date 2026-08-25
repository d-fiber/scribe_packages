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

import { wrote } from "@scribe/foundation/lib/foundation.ts";
import type { SearchOperation } from "../../contracts/definition.ts";
import { call } from "./source.ts";
import { searchOutbox, type SearchOutboxRow } from "./tables.ts";

/**
 * How many times a document is retried before it stops being tried.
 *
 * A row that fails five times fails on its own content, not on a passing outage, and retrying
 * it forever would keep the drain busy on the one document it cannot write.
 */
const MAX_ATTEMPTS = 5;

/** How much of the backlog one drain takes at a time. */
const BATCH_SIZE = 200;

/** What is waiting on one index. */
export interface SearchBacklog {
  /** How many documents are still in line. */
  readonly pending: number;

  /** How many stopped being retried and are waiting for someone to look. */
  readonly failed: number;
}

/**
 * Puts `ids` in line for `index`, and answers whether the line took them.
 *
 * @remarks
 * The write goes through a Postgres function rather than an insert because a document already
 * in line must keep one row: the function upserts on the pair, so a row updated a thousand
 * times between two drains is rebuilt once. The same function is what the shipped trigger
 * calls, which is what keeps a manual call and a table change on one mechanism.
 */
export async function enqueue(
  index: string,
  ids: readonly string[],
  operation: SearchOperation,
): Promise<boolean> {
  if (ids.length === 0) return true;

  const written = await call<unknown>("__search_enqueue__", {
    p_index: index,
    p_ids: [...ids],
    p_operation: operation,
  });

  return written !== null;
}

/**
 * The next batch waiting on any index, oldest first.
 *
 * @remarks
 * Nothing is locked. A row is left in place until the cluster acknowledged it, so two drains
 * running at once write the same document twice, which the cluster treats as one write. A lock
 * would buy nothing and would leave rows claimed by a process that died holding them.
 */
export function claim(limit: number = BATCH_SIZE): Promise<SearchOutboxRow[]> {
  return searchOutbox()
    .where((f) => f.failed_at.is(null))
    .order("enqueued_at")
    .limit(limit)
    .get();
}

/** Takes `ids` out of the line for `index`, which is what a written document leaves behind. */
export async function settle(index: string, ids: readonly string[]): Promise<boolean> {
  if (ids.length === 0) return true;

  return wrote(await searchOutbox()
    .where((f) => [f.index.eq(index), f.entity_id.in([...ids])])
    .delete());
}

/**
 * Records that `ids` could not be written for `index`, and stops retrying the ones that ran out.
 *
 * The reason is kept on the row rather than only in the log, because the log of the drain that
 * failed has usually rotated by the time someone asks why a document is missing.
 */
export async function fail(
  index: string,
  ids: readonly string[],
  reason: string,
): Promise<boolean> {
  if (ids.length === 0) return true;

  const written = await call<unknown>("__search_fail__", {
    p_index: index,
    p_ids: [...ids],
    p_error: reason,
    p_max_attempts: MAX_ATTEMPTS,
  });

  return written !== null;
}

/** What is waiting on `index`, or null when the line could not be read. */
export function backlog(index: string): Promise<SearchBacklog | null> {
  return call<SearchBacklog>("__search_backlog__", { p_index: index });
}
