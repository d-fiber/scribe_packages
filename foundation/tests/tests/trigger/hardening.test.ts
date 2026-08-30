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
import "@scribe/runtime/scholium/runner.ts";
import { allOf, equals, expect, isA, Scribe, throwsA, withMessage } from "@scribe/alchemy/test";
import "../../testing/settings.ts";
import { matchesOf } from "../../../lib/src/trigger/trigger_match.ts";
import type { RegisteredTrigger } from "../../../lib/src/trigger/trigger_registry.ts";
import { TriggerRegistry } from "../../../lib/src/trigger/trigger_registry.ts";
import type { TriggerEvent } from "../../../lib/src/trigger/trigger_event.ts";
import { eventFrom } from "../../../lib/src/trigger/trigger_event.ts";
import { parsePath } from "../../../lib/src/trigger/trigger_path.ts";
import { Trigger } from "../../../lib/src/trigger/trigger.ts";

interface OrderRow {
  id: string;
  status: string;
  meta: Record<string, unknown>;
}

const AT = "2026-08-19T10:00:00Z";
const noop = () => Promise.resolve();
const orders = Trigger.of<OrderRow>();

function trigger(over: Partial<RegisteredTrigger> = {}): RegisteredTrigger {
  return { name: "orders:update", table: "orders", key: "id", op: "update", fields: [], when: null, ...over };
}

function event(over: Partial<TriggerEvent> = {}): TriggerEvent {
  return {
    id: 1,
    table: "orders",
    op: "update",
    key: "order-1",
    before: { id: "order-1", status: "pending" },
    after: { id: "order-1", status: "paid" },
    at: AT,
    field: null,
    ...over,
  };
}

function registered(triggers: RegisteredTrigger[]): TriggerRegistry {
  const registry = new TriggerRegistry();
  for (const one of triggers) registry.add(one);
  return registry;
}

function nested(depth: number): unknown {
  let node: unknown = 1;
  for (let index = 0; index < depth; index++) node = { x: node };
  return node;
}

Scribe.test("DEFECT a structured column whose keys arrive in another order reads as a change", () => {
  const matches = matchesOf(
    [trigger({ name: "orders:meta", fields: ["meta"] })],
    event({
      before: { meta: { total: 10, currency: "EUR" } },
      after: { meta: { currency: "EUR", total: 10 } },
    }),
  );

  expect(matches, equals([]), "the column holds what it held, whatever order the two came out in");
});

Scribe.test("DEFECT a transition whose two bounds name the same value can never fire", () => {
  expect(
    () => orders.onFieldChange({ path: "invoices/{invoiceId}/status", when: { from: "paid", to: "paid" } }, noop),
    throwsA(allOf(isA(Error), withMessage("cannot"))),
  );
});

Scribe.test("DEFECT a table name carrying a separator is taken as a table name", () => {
  for (const hostile of ["orders,secrets", "orders&x", "orders/", " "]) {
    expect(() => parsePath(`${hostile}/{orderId}`), throwsA(allOf(isA(Error), withMessage(hostile))));
  }
});

Scribe.test("DEFECT a parameter made of blanks is taken as a parameter name", () => {
  expect(() => parsePath("orders/{ }"), throwsA(allOf(isA(Error), withMessage("is not a parameter"))));
  expect(() => parsePath("orders/{orderId}/ "), throwsA(allOf(isA(Error), withMessage("the field is empty"))));
});

Scribe.test("DEFECT a parameter written with the braces doubled keeps the inner braces in its name", () => {
  expect(() => parsePath("orders/{{orderId}}"), throwsA(allOf(isA(Error), withMessage("is not a parameter"))));
});

Scribe.test("a transition whose bounds name the same value delivers nothing, whatever the write did", () => {
  for (
    const [before, after] of [["paid", "paid"], ["pending", "paid"], ["paid", "pending"]] as const
  ) {
    const matches = matchesOf(
      [trigger({ fields: ["status"], when: { from: "paid", to: "paid" } })],
      event({ before: { status: before }, after: { status: after } }),
    );

    expect(matches, equals([]), `${before} to ${after} reached a body that can never be right`);
  }
});

Scribe.test("a watched column no row carries is delivered to nobody, silently", () => {
  const matches = matchesOf([trigger({ fields: ["statuz"] })], event());

  expect(matches, equals([]), "a column that is in no row moved from nothing to nothing");
});

Scribe.test("a row-watching declaration is delivered even when the write left the row alone", () => {
  const matches = matchesOf(
    [trigger()],
    event({ before: { id: "order-1", status: "paid" }, after: { id: "order-1", status: "paid" } }),
  );

  expect(matches.length, equals(1), "onUpdate answers to the write, and onFieldChange answers to the change");
});

Scribe.test("a column nested far deeper than any row is compared without raising", () => {
  const matches = matchesOf(
    [trigger({ fields: ["meta"] })],
    event({ before: { meta: nested(20_000) }, after: { meta: nested(20_000) } }),
  );

  expect(matches, equals([]), "depth alone is not what breaks the comparison");
});

Scribe.test("a table declared under two key columns is refused before a row is written", () => {
  const registry = registered([
    trigger({ name: "orders:insert", op: "insert" }),
    trigger({ name: "orders:delete", op: "delete", key: "reference" }),
  ]);

  expect(
    () => registry.sources(),
    throwsA(allOf(isA(Error), withMessage("the table is declared with two key columns"))),
  );
});

Scribe.test("a table declared twice under the one key writes one row", () => {
  const registry = registered([
    trigger({ name: "orders:insert", op: "insert" }),
    trigger({ name: "orders:delete", op: "delete" }),
  ]);

  expect(registry.sources(), equals([{ table_name: "orders", key_column: "id" }]));
});

Scribe.test("two declarations that would share a queue are refused at the second one", () => {
  const registry = registered([trigger()]);

  expect(() => registry.add(trigger()), throwsA(allOf(isA(Error), withMessage("is already declared"))));
});

Scribe.test("a name given by hand is what tells two declarations on one table and one operation apart", () => {
  const registry = registered([trigger(), trigger({ name: "orders:update:shipping" })]);

  expect(registry.list().map((one) => one.name), equals(["orders:update", "orders:update:shipping"]));
});

Scribe.test("an operation the outbox should never hold cannot be read into an event", () => {
  for (const op of ["truncate", "INSERT", "", "insert "]) {
    expect(
      eventFrom({
        id: 1,
        table_name: "orders",
        op,
        entity_id: "order-1",
        before: null,
        after: { id: "order-1" },
        occurred_at: AT,
      }),
      equals(null),
      `${JSON.stringify(op)} was read as an operation`,
    );
  }
});

Scribe.test("a path that stops at the row and one that ends on a column are told apart", () => {
  expect(parsePath("orders/{orderId}"), equals({ table: "orders", param: "orderId", field: null }));
  expect(parsePath("orders/{orderId}/status"), equals({ table: "orders", param: "orderId", field: "status" }));
});

Scribe.test("a declaration under a name of its own does not take the derived one", () => {
  const named = orders.onUpdate({ path: "quotes/{quoteId}", name: "quotes:renewal" }, noop);
  const derived = orders.onUpdate("quotes/{quoteId}", noop);

  expect(named.name, equals("quotes:renewal"));
  expect(derived.name, equals("quotes:update"));
});

Scribe.test("watching several columns and watching one of them are two declarations, not one", () => {
  const several = orders.onFieldsChange({ path: "carts/{cartId}", observe: ["status", "meta"] }, noop);

  expect(
    several.name,
    equals("carts:meta+status"),
    "the derived name is the sorted list, so the order of observe is not it",
  );
  expect(several.fields, equals(["status", "meta"]), "the order the caller wrote is the order the deliveries come in");
});
