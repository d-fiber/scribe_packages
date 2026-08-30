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
import "@scribe/runtime/scholium/runner.ts";
import { equals, expect, Scribe } from "@scribe/alchemy/test";
import "../../testing/settings.ts";
import { matchesOf } from "../../../lib/src/trigger/trigger_match.ts";
import type { RegisteredTrigger } from "../../../lib/src/trigger/trigger_registry.ts";
import { eventFrom, type TriggerEvent } from "../../../lib/src/trigger/trigger_event.ts";
import type { TriggerEventRow } from "../../../lib/src/trigger/trigger_tables.ts";

const PAID = "2026-08-19T10:00:00Z";

function trigger(over: Partial<RegisteredTrigger> = {}): RegisteredTrigger {
  return {
    name: "orders:update",
    table: "orders",
    key: "id",
    op: "update",
    fields: [],
    when: null,
    ...over,
  };
}

function event(over: Partial<TriggerEvent> = {}): TriggerEvent {
  return {
    id: 1,
    table: "orders",
    op: "update",
    key: "order-1",
    before: { id: "order-1", status: "pending", total: 10 },
    after: { id: "order-1", status: "paid", total: 10 },
    at: PAID,
    field: null,
    ...over,
  };
}

function row(over: Partial<TriggerEventRow> = {}): TriggerEventRow {
  return {
    id: 7,
    table_name: "orders",
    op: "insert",
    entity_id: "order-1",
    before: null,
    after: { id: "order-1" },
    occurred_at: PAID,
    ...over,
  };
}

Scribe.test("a declaration on another table is not delivered", () => {
  expect(matchesOf([trigger({ table: "invoices" })], event()), equals([]));
});

Scribe.test("a declaration on another operation is not delivered", () => {
  expect(matchesOf([trigger({ op: "insert" })], event()), equals([]));
});

Scribe.test("a declaration watching the row is delivered once, without a column", () => {
  const matches = matchesOf([trigger()], event());

  expect(matches.length, equals(1));
  expect(matches[0].field, equals(null));
});

Scribe.test("the row and one of its columns are both delivered by one write", () => {
  const matches = matchesOf(
    [trigger(), trigger({ name: "orders:status", fields: ["status"] })],
    event(),
  );

  expect(
    matches.map((match) => [match.trigger.name, match.field]),
    equals([
      ["orders:update", null],
      ["orders:status", "status"],
    ]),
  );
});

Scribe.test("a column that holds the value it held is not delivered", () => {
  const matches = matchesOf(
    [trigger({ name: "orders:total", fields: ["total"] })],
    event(),
  );

  expect(matches, equals([]));
});

Scribe.test("a declaration watching two columns is delivered once per column that moved", () => {
  const matches = matchesOf(
    [trigger({ name: "orders:status+total", fields: ["status", "total"] })],
    event({ after: { id: "order-1", status: "paid", total: 25 } }),
  );

  expect(matches.map((match) => match.field), equals(["status", "total"]));
});

Scribe.test("a transition is delivered when both of its bounds are met", () => {
  const matches = matchesOf(
    [trigger({ fields: ["status"], when: { from: "pending", to: "paid" } })],
    event(),
  );

  expect(matches.length, equals(1));
});

Scribe.test("a transition leaving another value is not delivered", () => {
  const matches = matchesOf(
    [trigger({ fields: ["status"], when: { from: "draft", to: "paid" } })],
    event(),
  );

  expect(matches, equals([]));
});

Scribe.test("a transition naming only what it reaches ignores where the column came from", () => {
  const matches = matchesOf(
    [trigger({ fields: ["status"], when: { to: "paid" } })],
    event({ before: { id: "order-1", status: "draft", total: 10 } }),
  );

  expect(matches.length, equals(1));
});

Scribe.test("a column that gained a value is delivered, and its absence reads as null", () => {
  const matches = matchesOf(
    [trigger({ fields: ["status"], when: { from: null, to: "paid" } })],
    event({ before: { id: "order-1", total: 10 } }),
  );

  expect(matches.length, equals(1));
});

Scribe.test("a structured column is compared on what it holds, not on its identity", () => {
  const matches = matchesOf(
    [trigger({ name: "orders:lines", fields: ["lines"] })],
    event({
      before: { id: "order-1", lines: [{ sku: "a" }] },
      after: { id: "order-1", lines: [{ sku: "a" }] },
    }),
  );

  expect(matches, equals([]));
});

Scribe.test("a deletion is read with the row it removed and no row after it", () => {
  const read = eventFrom(row({ op: "delete", before: { id: "order-1" }, after: null }));

  expect(read?.op, equals("delete"));
  expect(read?.key, equals("order-1"));
  expect(read?.after, equals(null));
  expect(read?.at, equals(PAID));
});

Scribe.test("a row whose operation is none of the three cannot be read", () => {
  expect(eventFrom(row({ op: "truncate" })), equals(null));
});
