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
