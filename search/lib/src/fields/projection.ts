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

import type { FieldSort, FieldSortOptions, NestedQuery, SearchQuery, SortOrder } from "../../contracts/query.ts";

/**
 * The fields of a document as a query sees them, one mapping per name.
 *
 * @remarks
 * It is deliberately wider than the cluster's own `MappingProperty`. What the checks below
 * read is the shape of a mapping and not its identity, so a declaration compiled by
 * `PropertiesOf` types a query without having to be assignable to a library type it never
 * travels as.
 */
export type DocumentProperties = Record<string, unknown>;

/** The fields of `P` a free-text clause may name, which are the analysed ones. */
export type TextFields<P extends DocumentProperties> = {
  [K in keyof P]: P[K] extends { type: "text" } ? K : never;
}[keyof P];

/** The fields of `P` carrying the folded keyword a sort compares. */
export type SortableFields<P extends DocumentProperties> = {
  [K in keyof P]: P[K] extends { fields: { keyword: unknown } } ? K : never;
}[keyof P];

/** The paths one level inside a folded field of `P`, dotted as the cluster writes them. */
export type NestedPaths<P extends DocumentProperties> = {
  [K in keyof P]: P[K] extends { properties: infer Sub }
    ? Sub extends DocumentProperties ? { [SK in keyof Sub & string]: `${K & string}.${SK}` }[keyof Sub & string]
    : never
    : never;
}[keyof P];

/** The folded fields of `P` whose rows stay searchable one by one. */
export type NestedFields<P extends DocumentProperties> =
  & {
    [K in keyof P]: P[K] extends { type: "nested" } ? K : never;
  }[keyof P]
  & string;

/**
 * The field names of one declaration, checked against what that declaration holds.
 *
 * @remarks
 * Every method answers the string the cluster reads, and its whole job is refusing the ones
 * that would not work: a sort on analysed text, a nested clause on a plain object, a field the
 * document never declared. None of that fails at the cluster with an error naming the mistake,
 * so it is worth the type machinery to have it fail at the declaration instead.
 */
export interface QueryFields<P extends DocumentProperties> {
  /** The field `name`, whatever it holds. */
  field<F extends keyof P & string>(name: F): F;

  /** The analysed field `name`, which a text clause may look in. */
  text<F extends TextFields<P> & string>(name: F): F;

  /** The path `name`, which leads one level inside a folded field. */
  path<F extends NestedPaths<P> & string>(name: F): F;

  /** The analysed field `name`, weighted by `weight` against the other fields of the clause. */
  boost<F extends TextFields<P> & string>(name: F, weight: number): `${F}^${number}`;

  /** A clause run against each row held by the nested field `path`. */
  nested(path: NestedFields<P>, query: SearchQuery): NestedQuery;

  /** A sort on the field `name`, which must not be analysed text. */
  sort<F extends keyof P & string>(
    name: F,
    order: SortOrder,
    options?: Omit<FieldSortOptions, "order">,
  ): FieldSort;

  /** A sort on the folded keyword the sortable text field `name` carries beside it. */
  keyword<F extends SortableFields<P> & string>(name: F, order: SortOrder): FieldSort;
}

/**
 * The field names of a declaration whose document compiled into `P`.
 *
 * It holds nothing: `P` is what does the work, and every method answers what it was handed.
 */
export function queryFields<P extends DocumentProperties>(): QueryFields<P> {
  return {
    field: (name) => name,
    text: (name) => name,
    path: (name) => name,
    boost: (name, weight) => `${name}^${weight}`,
    nested: (path, query) => ({ nested: { path, query } }),
    sort: (name, order, options) => ({ [name]: options ? { order, ...options } : order }),
    keyword: (name, order) => ({ [`${name}.keyword`]: order }),
  };
}
