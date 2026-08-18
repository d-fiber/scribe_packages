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

// deno-lint-ignore-file no-explicit-any

import type { FilterSpec } from "./filter.ts";

/** One ordering clause, as PostgREST takes it. */
export interface QueryOrder {
  /** The column to order by. */
  readonly col: string;

  /** How to order, left to PostgREST's own defaults when absent. */
  readonly options?: {
    /** Whether to order upwards. Downwards when false. */
    ascending?: boolean;

    /** Whether nulls come first rather than last. */
    nullsFirst?: boolean;

    /** The embedded table this column belongs to, when ordering by a relation. */
    foreignTable?: string;
  };
}

/** Everything a builder has been told, held apart from the builder so a chain stays immutable. */
export interface QueryState {
  /**
   * Whether the caller opted out of the owner scope.
   *
   * The scope is what narrows a query to the caller's own rows, so opting out means the
   * authorisation was decided upstream.
   */
  readonly unscoped: boolean;

  /** Whether the caller declared that touching every row of the table is deliberate. */
  readonly entireTable: boolean;

  /** The columns to select, as PostgREST spells them. Every column when null. */
  readonly selectCols: string | null;

  /** The conditions to apply, in the order they were added. */
  readonly filters: readonly FilterSpec[];

  /** The ordering clauses to apply, in the order they were added. */
  readonly orders: readonly QueryOrder[];

  /** How many rows at most, or null for no limit of the caller's own. */
  readonly limitCount: number | null;

  /** The inclusive row range to ask for, as `[from, to]`, or null when none was asked for. */
  readonly rangeVal: readonly [number, number] | null;
}

export const DEFAULT_STATE: QueryState = {
  unscoped: false,
  entireTable: false,
  selectCols: null,
  filters: [],
  orders: [],
  limitCount: null,
  rangeVal: null,
};

export const AMBIGUITY_PROBE = 2;

export function atMostOneRow(state: QueryState): QueryState {
  if (state.limitCount !== null || state.rangeVal !== null) return state;
  return { ...state, limitCount: AMBIGUITY_PROBE };
}

export function buildRead(db: any, table: string, state: QueryState): any {
  let qb = db.from(table).select(state.selectCols ?? "*");
  for (const f of state.filters) qb = f.apply(qb);
  for (const o of state.orders) qb = qb.order(o.col, o.options);
  if (state.limitCount !== null) qb = qb.limit(state.limitCount);
  if (state.rangeVal !== null) qb = qb.range(...state.rangeVal);
  return qb;
}

export function buildWrite(
  db: any,
  table: string,
  state: QueryState,
  op: "update" | "delete",
  data?: unknown,
): any {
  let qb = op === "update" ? db.from(table).update(data) : db.from(table).delete();
  for (const f of state.filters) qb = f.apply(qb);
  return qb;
}
