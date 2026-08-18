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

export interface QueryOrder {
  readonly col: string;
  readonly options?: {
    ascending?: boolean;
    nullsFirst?: boolean;
    foreignTable?: string;
  };
}

export interface QueryState {
  readonly unscoped: boolean;
  readonly entireTable: boolean;
  readonly selectCols: string | null;
  readonly filters: readonly FilterSpec[];
  readonly orders: readonly QueryOrder[];
  readonly limitCount: number | null;
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
