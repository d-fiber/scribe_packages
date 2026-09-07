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

import { create } from "@bufbuild/protobuf";
import {
  type Filter,
  FilterOperator,
  FilterSchema,
  Operation,
  type Query,
} from "@scribe/sdk/gen/scribe/packages/foundation/protocol/database_pb.ts";
import { encodeJson } from "@scribe/sdk";
import { ownerOf } from "../table_owners.ts";
import { NOBODY, ownerScope } from "./owner_scope.ts";
import { namesSomething } from "./wire_filters.ts";

/**
 * Whether `query` is a write that would reach every row of its table.
 *
 * @remarks
 * A worker sends what it means, and an update or a delete carrying no predicate means the whole
 * table. That is almost always a filter somebody forgot to build rather than a table somebody
 * meant to empty, so it is refused here: the two are indistinguishable once the statement has
 * run, and only one of them is recoverable.
 *
 * An owned table is already bounded by the owner filter, so the question only arises where no
 * column says who a row belongs to.
 */
export function reachesEveryRow(query: Query): boolean {
  if (query.operation !== Operation.UPDATE && query.operation !== Operation.DELETE) return false;
  if (namesSomething(query.where)) return false;

  return ownerFilter(query) === null;
}

/** The filter that bounds `query` to the owner column of its table, or `null` when it has none. */
export function ownerFilter(query: Query): Filter | null {
  const column = ownerOf(query.table);
  if (column === null) return null;

  const decision = ownerScope(query.table);
  if (decision.kind === "open") return null;

  return create(FilterSchema, {
    column: decision.column,
    operator: FilterOperator.EQ,
    value: encodeJson(decision.kind === "scoped" ? decision.id : NOBODY),
  });
}

/** `payload`, with the owner column filled from the caller's own scope where it was left out. */
export function ownedPayload(query: Query, payload: unknown): unknown {
  const decision = ownerScope(query.table);
  if (decision.kind !== "scoped") return payload;

  const withOwner = (row: Record<string, unknown>) =>
    row[decision.column] === undefined || row[decision.column] === null
      ? { ...row, [decision.column]: decision.id }
      : row;

  return Array.isArray(payload)
    ? payload.map((row) => withOwner(row as Record<string, unknown>))
    : withOwner(payload as Record<string, unknown>);
}
