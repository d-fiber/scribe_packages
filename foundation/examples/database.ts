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

import { type Future, type Result } from "@scribe/alchemy";
import { Database } from "../lib/src/database/table.ts";

/** One row of the orders table. */
interface OrderRow {
  /** The primary key. */
  id: string;

  /** The account the order belongs to, which is also the column the owner scope filters on. */
  account_id: string;

  /** What the order is worth, in cents. */
  total: number;

  /** Where the order stands: `pending`, `paid` or `cancelled`. */
  status: string;

  /** When the row was written. */
  created_at: string;
}

/**
 * A handle on the orders table, kept at module scope.
 *
 * It holds neither a client nor an identity: the owner filter is decided when a query is
 * compiled, from whoever is calling then, so one built at import time serves every request
 * without carrying anything from the first.
 *
 * A project with several tables to declare this way instead writes a shared schema and a bound
 * `Table<S, K>`, which checks a table's name against every other one the schema names. `Database`
 * skips that schema: it fits a single table nothing else needs to agree with on a name.
 */
export const orders = new Database<OrderRow>("orders");

/** Reads a page, naming the columns it wants so the result type is the shape it asked for. */
export function recentOrders(since: string): Future<{ id: string; total: number }[]> {
  return orders
    .select((o) => ({ id: o.id, total: o.total }))
    .where((f) => f.created_at.gte(since))
    .order("created_at", { ascending: false })
    .limit(50)
    .get();
}

/** Reads at most one row, answering null when nothing matches. */
export function orderById(id: string): Future<OrderRow | null> {
  return orders.where((f) => f.id.eq(id)).getOne();
}

/** Several filters travel as an array, and they narrow together. */
export function pendingOver(amount: number): Future<OrderRow[]> {
  return orders.where((f) => [f.status.eq("pending"), f.total.gt(amount)]).get();
}

/**
 * Writes a row and answers it back, with the owner column filled in when it was left out.
 *
 * The outcome carries the row on success and a refusal otherwise, so a caller reads why a write
 * did not happen rather than inferring it from an absence.
 */
export function place(order: Partial<OrderRow>): Future<Result<OrderRow>> {
  return orders.insertOne(order);
}

/**
 * Writes to the rows a filter names.
 *
 * A write with no filter is refused rather than applied to the table: `entireTable()` is how
 * a caller says that is what it meant.
 */
export function markPaid(id: string): Future<Result<number>> {
  return orders.where((f) => f.id.eq(id)).update({ status: "paid" });
}

/**
 * Reads across owners, which the scope refuses unless the caller says so.
 *
 * `unscoped()` belongs to code that has already checked upstream who is allowed to cross.
 */
export function everyPendingOrder(): Future<OrderRow[]> {
  return orders.unscoped().where((f) => f.status.eq("pending")).get();
}
