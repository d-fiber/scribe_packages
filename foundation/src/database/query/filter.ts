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

export interface FilterSpec {
  readonly column: string;
  apply(qb: any): any;
}

function on(column: string, apply: (qb: any) => any): FilterSpec {
  return { column, apply };
}

type FilterOps<V> = {
  eq(value: V): FilterSpec;
  neq(value: V): FilterSpec;
  gt(value: V): FilterSpec;
  lt(value: V): FilterSpec;
  gte(value: V): FilterSpec;
  lte(value: V): FilterSpec;
  is(value: V | null): FilterSpec;
  in(values: V[]): FilterSpec;
  like(pattern: string): FilterSpec;
  ilike(pattern: string): FilterSpec;
};

export type FilterBuilder<T> = {
  readonly [K in keyof T & string]: FilterOps<T[K]>;
};

export function filter<T>(): FilterBuilder<T> {
  const ops = (col: string): FilterOps<any> => ({
    eq: (v) => on(col, (qb) => qb.eq(col, v)),
    neq: (v) => on(col, (qb) => qb.neq(col, v)),
    gt: (v) => on(col, (qb) => qb.gt(col, v)),
    lt: (v) => on(col, (qb) => qb.lt(col, v)),
    gte: (v) => on(col, (qb) => qb.gte(col, v)),
    lte: (v) => on(col, (qb) => qb.lte(col, v)),
    is: (v) => on(col, (qb) => qb.is(col, v)),
    in: (v) => on(col, (qb) => qb.in(col, v)),
    like: (p) => on(col, (qb) => qb.like(col, p)),
    ilike: (p) => on(col, (qb) => qb.ilike(col, p)),
  });
  return new Proxy({} as FilterBuilder<T>, {
    get: (_, col: string) => ops(col),
  });
}
