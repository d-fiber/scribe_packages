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

import { Table } from "@scribe/foundation/src/database/table.ts";

/** One row of the outbox the SQL function writes and the runner drains. */
export interface TriggerEventRow {
  /** The identifier the sequence assigned when the row was written. */
  id: number;

  /** The table the change happened on. */
  table_name: string;

  /** What happened, one of `insert`, `update` or `delete`. */
  op: string;

  /** The primary key of the changed row, as text. */
  entity_id: string;

  /** The row before the write, absent on an insertion. */
  before: Record<string, unknown> | null;

  /** The row after the write, absent on a deletion. */
  after: Record<string, unknown> | null;

  /** When the change was committed, as Postgres recorded it. */
  occurred_at: string;
}

/**
 * One row of the table that says which tables emit, and under which key.
 *
 * It is what makes a declaration reach Postgres without any DDL: the trigger sits on every
 * table of `public`, reads this table, and writes nothing for a table nobody declared.
 */
export interface TriggerSourceRow {
  /** The table that emits. */
  table_name: string;

  /** The column holding the identifier of one row, `id` unless a declaration named another. */
  key_column: string;
}

/**
 * The two tables this subject ships, as the query builder needs to see them.
 *
 * They are declared here rather than taken from the generated schema because the package owns
 * the SQL that creates them, and `scribe gen code` does not walk the SQL of a package.
 */
export type TriggerSchema = {
  /** The outbox the SQL function writes and the runner drains. */
  __trigger_events__: { row: TriggerEventRow };

  /** Which tables emit, and under which key. */
  __trigger_sources__: { row: TriggerSourceRow };
};

/** A handle on one of this subject's own tables. */
export class TriggerTable<K extends keyof TriggerSchema & string> extends Table<TriggerSchema, K> {}

/** The outbox the SQL function writes and the runner drains. */
export function triggerEvents(): TriggerTable<"__trigger_events__"> {
  return new TriggerTable("__trigger_events__");
}

/** Which tables emit, and under which key. */
export function triggerSources(): TriggerTable<"__trigger_sources__"> {
  return new TriggerTable("__trigger_sources__");
}
