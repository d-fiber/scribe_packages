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

import {
  type Filter,
  type FilterGroup,
  FilterOperator,
} from "@scribe/sdk/gen/scribe/packages/foundation/protocol/database_pb.ts";
import { decodeJson } from "@scribe/sdk/transport.ts";
import {
  assertPlainColumn,
  keywordLiteral,
  quoteFilterList,
  quoteFilterLiteral,
  UnsafeFilterError,
} from "./filter_literal.ts";

/**
 * Applies `filter` to `builder`, one PostgREST chained call per {@link FilterOperator}.
 *
 * @remarks
 * This reads a wire `Filter`, the shape a worker sent, and is the sibling of `filter_builder.ts`'s
 * `FilterBuilder<T>`, which reads the shape a project writes with `.where(...)`. The two never
 * meet: one is built by a generated `Table`, the other decoded off a `Query` message, and only
 * this one needs to reach a live PostgREST query builder rather than a typed spec.
 */
// deno-lint-ignore no-explicit-any -- the builder type differs at each chained call, picked by a runtime Operation, so no single type covers every stage.
export function applyOperator(builder: any, filter: Filter): any {
  const value = decodeJson(filter.value);
  const negated = filter.negated ? builder.not : builder;
  const column = filter.column;

  switch (filter.operator) {
    case FilterOperator.EQ:
      return negated.eq(column, value);
    case FilterOperator.NEQ:
      return negated.neq(column, value);
    case FilterOperator.GT:
      return negated.gt(column, value);
    case FilterOperator.GTE:
      return negated.gte(column, value);
    case FilterOperator.LT:
      return negated.lt(column, value);
    case FilterOperator.LTE:
      return negated.lte(column, value);
    case FilterOperator.LIKE:
      return negated.like(column, value);
    case FilterOperator.ILIKE:
      return negated.ilike(column, value);
    case FilterOperator.IN:
      return negated.in(column, value);
    case FilterOperator.IS:
      return negated.is(column, value);
    case FilterOperator.CONTAINS:
      return negated.contains(column, value);
    case FilterOperator.CONTAINED_BY:
      return negated.containedBy(column, value);
    case FilterOperator.OVERLAPS:
      return negated.overlaps(column, value);
    case FilterOperator.TEXT_SEARCH:
      return negated.textSearch(column, value);
    default:
      return builder;
  }
}

const OPERATOR_NAMES: Partial<Record<FilterOperator, string>> = {
  [FilterOperator.EQ]: "eq",
  [FilterOperator.NEQ]: "neq",
  [FilterOperator.GT]: "gt",
  [FilterOperator.GTE]: "gte",
  [FilterOperator.LT]: "lt",
  [FilterOperator.LTE]: "lte",
  [FilterOperator.LIKE]: "like",
  [FilterOperator.ILIKE]: "ilike",
  [FilterOperator.IN]: "in",
  [FilterOperator.IS]: "is",
  [FilterOperator.CONTAINS]: "cs",
  [FilterOperator.CONTAINED_BY]: "cd",
  [FilterOperator.OVERLAPS]: "ov",
  [FilterOperator.TEXT_SEARCH]: "fts",
};

function operatorName(operator: FilterOperator): string {
  const name = OPERATOR_NAMES[operator];
  if (name === undefined) {
    throw new UnsafeFilterError(`operator ${operator} has no disjunction form`);
  }
  return name;
}

function disjunctionTerm(filter: Filter): string {
  const column = assertPlainColumn(filter.column);
  const operator = operatorName(filter.operator);
  const value = decodeJson(filter.value);
  const negation = filter.negated ? "not." : "";

  if (filter.operator === FilterOperator.IS) {
    return `${column}.${negation}is.${keywordLiteral(value)}`;
  }

  if (filter.operator === FilterOperator.IN) {
    const values = Array.isArray(value) ? value : [value];
    return `${column}.${negation}in.${quoteFilterList(values)}`;
  }

  return `${column}.${negation}${operator}.${quoteFilterLiteral(value)}`;
}

function disjunction(group: FilterGroup): string {
  return group.filters.map(disjunctionTerm).join(",");
}

/** Applies every filter and group `where` names to `builder`, `or()` for a disjunctive group. */
// deno-lint-ignore no-explicit-any -- see applyOperator: the builder type varies by chained call.
export function applyFilters(builder: any, where: FilterGroup | undefined): any {
  if (!where) return builder;

  let current = builder;
  for (const filter of where.filters) current = applyOperator(current, filter);
  for (const group of where.groups) {
    current = group.disjunction ? current.or(disjunction(group)) : applyFilters(current, group);
  }
  return current;
}

/** Whether `where` names anything at all, at any depth. */
export function namesSomething(where: FilterGroup | undefined): boolean {
  if (!where) return false;
  if (where.filters.length > 0) return true;
  return where.groups.some(namesSomething);
}
