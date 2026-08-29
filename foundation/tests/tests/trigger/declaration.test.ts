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
import "@scribe/testing/runner.ts";
import { allOf, contains, equals, expect, isA, Scribe, throwsA, withMessage } from "@scribe/alchemy/test";
import { triggerRegistry } from "../../../lib/src/trigger/trigger_registry.ts";
import { Trigger } from "../../../lib/src/trigger/trigger.ts";

interface OrderRow {
  id: string;
  reference: string;
  status: string;
  total: number;
}

const noop = () => Promise.resolve();

const orders = Trigger.of<OrderRow>();

function declared(name: string): boolean {
  return triggerRegistry.list().some((trigger) => trigger.name === name);
}

Scribe.test("onInsert takes its name from the table and the operation", () => {
  const trigger = orders.onInsert("orders/{orderId}", noop);

  expect(trigger.name, equals("orders:insert"));
  expect(trigger.table, equals("orders"));
  expect(trigger.op, equals("insert"));
  expect(trigger.fields, equals([]));
  expect(declared("orders:insert"), equals(true));
});

Scribe.test("onUpdate and onDelete take the same name under their own operation", () => {
  expect(orders.onUpdate("orders/{orderId}", noop).name, equals("orders:update"));
  expect(orders.onDelete("orders/{orderId}", noop).name, equals("orders:delete"));
});

Scribe.test("onFieldChange takes its name from the column the path ends on", () => {
  const trigger = orders.onFieldChange("orders/{orderId}/status", noop);

  expect(trigger.name, equals("orders:status"));
  expect(trigger.op, equals("update"));
  expect(trigger.fields, equals(["status"]));
});

Scribe.test("onFieldsChange sorts the columns it watches into its name", () => {
  const trigger = orders.onFieldsChange(
    { path: "invoices/{invoiceId}", observe: ["total", "status"] },
    noop,
  );

  expect(trigger.name, equals("invoices:status+total"));
  expect(trigger.fields, equals(["total", "status"]));
});

Scribe.test("a declaration takes the key column it names, and id when it names none", () => {
  expect(orders.onInsert("carts/{cartId}", noop).key, equals("id"));
  expect(orders.onInsert({ path: "shipments/{ref}", key: "reference" }, noop).key, equals("reference"));
});

Scribe.test("a name given by hand tells two declarations on the same table apart", () => {
  orders.onUpdate("refunds/{refundId}", noop);
  const named = orders.onUpdate(
    { path: "refunds/{refundId}", name: "refunds:shipping" },
    noop,
  );

  expect(named.name, equals("refunds:shipping"));
});

Scribe.test("two declarations that derive the same name are refused", () => {
  orders.onInsert("payments/{paymentId}", noop);

  expect(
    () => orders.onInsert("payments/{paymentId}", noop),
    throwsA(allOf(isA(Error), withMessage('"payments:insert" is already declared'))),
  );
});

Scribe.test("onFieldsChange refuses a path that also names a column", () => {
  const path: string = "audits/{auditId}/status";

  expect(
    () => orders.onFieldsChange({ path, observe: ["status"] }, noop),
    throwsA(allOf(isA(Error), withMessage("the path stops at the row"))),
  );
});

Scribe.test("onFieldsChange refuses an empty list of columns", () => {
  expect(() =>
    orders.onFieldsChange(
      { path: "audits/{auditId}", observe: [] },
      noop,
    ), throwsA(allOf(isA(Error), withMessage('"observe" names no column'))));
});

Scribe.test("onFieldChange refuses a transition on a path that names no column", () => {
  const path: string = "quotes/{quoteId}";

  expect(
    () => orders.onFieldChange({ path, when: {} }, noop),
    throwsA(allOf(isA(Error), withMessage("the path has to end on a column"))),
  );
});

Scribe.test("the report counts the declarations and the tables they sit on", () => {
  const report = triggerRegistry.report();

  expect(report, contains("[trigger]"));
  expect(report, contains("declared on"));
});
