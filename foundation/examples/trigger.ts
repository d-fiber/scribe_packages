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

import { Future } from "@scribe/alchemy";
import { Trigger } from "@scribe/foundation/lib/src/trigger/trigger.ts";

/** One row of the orders table, as the bodies below read it. */
interface OrderRow {
  /** The primary key, which is the column a declaration keys on unless it names another. */
  id: string;

  /** The account the order belongs to. */
  account_id: string;

  /** Where the order stands. */
  status: string;

  /** What the order is worth, in cents. */
  total: number;
}

/**
 * The five methods, bound once to the type of the rows the table holds.
 *
 * The row type is named rather than inferred: the engine is not allowed to know a project's
 * schema. Nothing is armed until a method is called, so one handle serves a whole file.
 */
const orders = Trigger.of<OrderRow>();

/**
 * Fires once per row written into the table the path names.
 *
 * The project writes no SQL. The trigger already sits on every table of `public`, and what a
 * declaration changes is a row the process writes when it boots.
 */
export const onOrderPlaced = orders.onInsert(
  "orders/{orderId}",
  async (change) => {
    await confirm(change.after.account_id, change.params.orderId);
  },
);

/** Fires for every write that leaves the row different from what it was. */
export const onOrderTouched = orders.onUpdate(
  "orders/{orderId}",
  async (change) => {
    await audit(change.before.status, change.after.status);
  },
);

/** Fires once per row removed, and the body reads the values it had just before it went. */
export const onOrderDropped = orders.onDelete(
  "orders/{orderId}",
  async (change) => {
    await release(change.before.id);
  },
);

/**
 * Fires when one column holds a value it did not hold before.
 *
 * `update of <column>` fires on assignment and not on change, so `set status = status` would
 * reach a body written in SQL. The comparison is made here instead, which is what this method
 * is for. `when` narrows it further to the transition worth waking up for.
 */
export const onOrderPaid = orders.onFieldChange(
  { path: "orders/{orderId}/status", when: { from: "pending", to: "paid" } },
  async (change) => {
    await ship(change.row.id, change.after);
  },
);

/**
 * Watches several columns, and calls the body once per column that moved.
 *
 * Testing `change.field` narrows the two values with it, so `change.after` inside the branch
 * is the type of the column the branch names.
 */
export const onOrderRevised = orders.onFieldsChange(
  { path: "orders/{orderId}", observe: ["status", "total"], name: "order-revised" },
  async (change) => {
    if (change.field === "total") await reprice(change.after);
  },
);

/** Tells the buyer their order was taken. */
function confirm(_accountId: string, _orderId: string): Future<void> {
  return Future.value(undefined);
}

/** Records that a status moved, and between which two values. */
function audit(_before: string, _after: string): Future<void> {
  return Future.value(undefined);
}

/** Hands back what the order was holding. */
function release(_orderId: string): Future<void> {
  return Future.value(undefined);
}

/** Asks the warehouse to send what the order names. */
function ship(_orderId: string, _status: string): Future<void> {
  return Future.value(undefined);
}

/** Works out what the new total means for anything derived from it. */
function reprice(_total: number): Future<void> {
  return Future.value(undefined);
}
