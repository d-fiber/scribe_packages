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

// deno-lint-ignore-file no-explicit-any

/** One condition of a `where`, kept as the column it names and the call that applies it. */
export interface FilterSpec {
  /** The column this condition narrows, which is what the owner scope is checked against. */
  readonly column: string;

  /** Applies this condition to a PostgREST builder and answers it back for chaining. */
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
