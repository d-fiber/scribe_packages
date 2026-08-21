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

import type { TriggerEventRow } from "../db/tables.ts";
import type { TriggerOp } from "./change.ts";

/**
 * One change as it travels from the outbox to a body, through the queue.
 *
 * It is the queue's payload, so it has to survive JSON: the commit time stays the string
 * Postgres wrote and becomes a `Date` only when the body is called.
 */
export interface TriggerEvent {
  /** The identifier of the outbox row, which the message id is derived from. */
  readonly id: number;

  /** The table the change happened on. */
  readonly table: string;

  /** What happened. */
  readonly op: TriggerOp;

  /** The primary key of the changed row, as text. */
  readonly key: string;

  /** The row before the write, absent on an insertion. */
  readonly before: Record<string, unknown> | null;

  /** The row after the write, absent on a deletion. */
  readonly after: Record<string, unknown> | null;

  /** When the change was committed, as Postgres wrote it. */
  readonly at: string;

  /** The column this delivery is about, when a declaration watches columns rather than rows. */
  readonly field: string | null;
}

/** The three values the `op` column is allowed to hold. */
const OPS: readonly string[] = ["insert", "update", "delete"];

/**
 * Reads an outbox row, and answers null for one nothing can be done with.
 *
 * A row whose `op` is not one of the three cannot be routed to any declaration, and keeping it
 * would block everything written behind it. The runner drops it and says so.
 */
export function eventFrom(row: TriggerEventRow): TriggerEvent | null {
  if (!OPS.includes(row.op)) return null;

  return {
    id: row.id,
    table: row.table_name,
    op: row.op as TriggerOp,
    key: row.entity_id,
    before: row.before,
    after: row.after,
    at: row.occurred_at,
    field: null,
  };
}
