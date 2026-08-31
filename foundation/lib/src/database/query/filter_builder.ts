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

import { assertPlainColumn, keywordLiteral, quoteFilterList, quoteFilterLiteral } from "./filter_literal.ts";

/** One condition of a `where`, kept as the column it names and the call that applies it. */
export interface FilterSpec {
  /** The column this condition narrows, which is what the owner scope is checked against. */
  readonly column: string;

  /** Applies this condition to a PostgREST builder and answers it back for chaining. */
  // deno-lint-ignore no-explicit-any -- the builder type differs at each chained call, so no single type covers every caller of apply.
  apply(qb: any): any;
}

// deno-lint-ignore no-explicit-any -- see FilterSpec.apply: the builder type differs at each chained call.
function on(column: string, apply: (qb: any) => any): FilterSpec {
  return { column, apply };
}

/**
 * One condition, written as the term PostgREST reads rather than left to the client to render.
 *
 * @remarks
 * The client renders a value by its JavaScript type, so the string `"null"` and an absent value
 * become the same term, a quote inside a list member runs into the member after it, and a nested
 * array flattens into as many members as it holds. Each of those is a caller asking one question
 * and the database answering another.
 *
 * The literal is built by `filter_literal.ts`, which quotes and escapes, and handed to the
 * client's own escape hatch, which appends what it is given.
 */
function said(column: string, operator: string, literal: string): FilterSpec {
  assertPlainColumn(column);
  return on(column, (qb) => qb.filter(column, operator, literal));
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
  const ops = (col: string): FilterOps<unknown> => ({
    eq: (v) => said(col, "eq", quoteFilterLiteral(v)),
    neq: (v) => said(col, "neq", quoteFilterLiteral(v)),
    gt: (v) => said(col, "gt", quoteFilterLiteral(v)),
    lt: (v) => said(col, "lt", quoteFilterLiteral(v)),
    gte: (v) => said(col, "gte", quoteFilterLiteral(v)),
    lte: (v) => said(col, "lte", quoteFilterLiteral(v)),
    is: (v) => said(col, "is", keywordLiteral(v)),
    in: (v) => said(col, "in", quoteFilterList(v)),
    like: (p) => said(col, "like", quoteFilterLiteral(p)),
    ilike: (p) => said(col, "ilike", quoteFilterLiteral(p)),
  });
  return new Proxy({} as FilterBuilder<T>, {
    get: (_, col: string) => ops(col),
  });
}
