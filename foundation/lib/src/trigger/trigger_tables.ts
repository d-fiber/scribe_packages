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

import { Table } from "@scribe/foundation/lib/src/database/table.ts";

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
