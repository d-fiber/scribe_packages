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

import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { Trigger, triggerRegistry } from "@scribe/foundation/lib/src/trigger/mod.ts";

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

Deno.test("onInsert takes its name from the table and the operation", () => {
  const trigger = orders.onInsert("orders/{orderId}", noop);

  assertEquals(trigger.name, "orders:insert");
  assertEquals(trigger.table, "orders");
  assertEquals(trigger.op, "insert");
  assertEquals(trigger.fields, []);
  assertEquals(declared("orders:insert"), true);
});

Deno.test("onUpdate and onDelete take the same name under their own operation", () => {
  assertEquals(orders.onUpdate("orders/{orderId}", noop).name, "orders:update");
  assertEquals(orders.onDelete("orders/{orderId}", noop).name, "orders:delete");
});

Deno.test("onFieldChange takes its name from the column the path ends on", () => {
  const trigger = orders.onFieldChange("orders/{orderId}/status", noop);

  assertEquals(trigger.name, "orders:status");
  assertEquals(trigger.op, "update");
  assertEquals(trigger.fields, ["status"]);
});

Deno.test("onFieldsChange sorts the columns it watches into its name", () => {
  const trigger = orders.onFieldsChange(
    { path: "invoices/{invoiceId}", observe: ["total", "status"] },
    noop,
  );

  assertEquals(trigger.name, "invoices:status+total");
  assertEquals(trigger.fields, ["total", "status"]);
});

Deno.test("a declaration takes the key column it names, and id when it names none", () => {
  assertEquals(orders.onInsert("carts/{cartId}", noop).key, "id");
  assertEquals(
    orders.onInsert({ path: "shipments/{ref}", key: "reference" }, noop).key,
    "reference",
  );
});

Deno.test("a name given by hand tells two declarations on the same table apart", () => {
  orders.onUpdate("refunds/{refundId}", noop);
  const named = orders.onUpdate(
    { path: "refunds/{refundId}", name: "refunds:shipping" },
    noop,
  );

  assertEquals(named.name, "refunds:shipping");
});

Deno.test("two declarations that derive the same name are refused", () => {
  orders.onInsert("payments/{paymentId}", noop);

  assertThrows(
    () => orders.onInsert("payments/{paymentId}", noop),
    Error,
    '"payments:insert" is already declared',
  );
});

Deno.test("onFieldsChange refuses a path that also names a column", () => {
  const path: string = "audits/{auditId}/status";

  assertThrows(
    () => orders.onFieldsChange({ path, observe: ["status"] }, noop),
    Error,
    "the path stops at the row",
  );
});

Deno.test("onFieldsChange refuses an empty list of columns", () => {
  assertThrows(
    () =>
      orders.onFieldsChange(
        { path: "audits/{auditId}", observe: [] },
        noop,
      ),
    Error,
    '"observe" names no column',
  );
});

Deno.test("onFieldChange refuses a transition on a path that names no column", () => {
  const path: string = "quotes/{quoteId}";

  assertThrows(
    () => orders.onFieldChange({ path, when: {} }, noop),
    Error,
    "the path has to end on a column",
  );
});

Deno.test("the report counts the declarations and the tables they sit on", () => {
  const report = triggerRegistry.report();

  assertStringIncludes(report, "[trigger]");
  assertStringIncludes(report, "declared on");
});
