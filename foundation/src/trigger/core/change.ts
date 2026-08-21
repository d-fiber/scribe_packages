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

import type { ParamsOf } from "./path.ts";

/** What happened to the row, as the SQL function writes it. */
export type TriggerOp = "insert" | "update" | "delete";

/** What every body is handed, whichever method declared it. */
export interface ChangeBase<P extends string> {
  /** The table the row belongs to. */
  readonly table: string;

  /** The primary key of the row, as text, which is also what `params` carries. */
  readonly key: string;

  /** The key under the name the path gave it. */
  readonly params: ParamsOf<P>;

  /** When the change was committed, as Postgres recorded it. */
  readonly at: Date;
}

/** What a body declared with `onInsert` is handed. */
export interface InsertChange<TRow, P extends string> extends ChangeBase<P> {
  /** The row as it was written. */
  readonly after: TRow;
}

/** What a body declared with `onUpdate` is handed. */
export interface UpdateChange<TRow, P extends string> extends ChangeBase<P> {
  /** The row before the write. */
  readonly before: TRow;

  /** The row after the write. */
  readonly after: TRow;
}

/** What a body declared with `onDelete` is handed. */
export interface DeleteChange<TRow, P extends string> extends ChangeBase<P> {
  /** The row as it was just before it went. */
  readonly before: TRow;
}

/**
 * What a body watching one column is handed.
 *
 * `before` and `after` are the two values of that column and never the row, which is what makes
 * the method worth having: a body reads `change.after` and not `change.after.status`. The row is
 * still there under {@link FieldChange.row} for everything the column does not carry.
 */
export interface FieldChange<TRow, P extends string, F extends keyof TRow> extends ChangeBase<P> {
  /** The column that moved. */
  readonly field: F;

  /** Its value before the write. */
  readonly before: TRow[F];

  /** Its value after the write. */
  readonly after: TRow[F];

  /** The whole row as it stands after the write. */
  readonly row: TRow;
}

/**
 * What a body watching several columns is handed, as one shape per column.
 *
 * It is a union rather than a single shape so that testing `change.field` narrows the two
 * values with it: inside `if (change.field === "total")`, `change.after` is the type of `total`.
 */
export type FieldsChange<TRow, P extends string, F extends keyof TRow> = {
  [K in F]: FieldChange<TRow, P, K>;
}[F];

/** A body, whatever shape the method hands it. */
export type ChangeHandler<TChange> = (change: TChange) => void | Promise<void>;
