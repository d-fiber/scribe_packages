// Copyright (C) 2026 Fiber
//
// This file is part of scribe and is made available under the PolyForm Shield
// License 1.0.0. The full terms are in the LICENSE file at the root of this
// repository, and at https://polyformproject.org/licenses/shield/1.0.0
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
//
// The one thing you may not do:
// - Use it to provide any product that competes with scribe, or with any
//   product Fiber or its affiliates provide using scribe. Products compete
//   even when they are offered free of charge, through a different kind of
//   interface, or for a different technical platform.
//
// If you pass this software on:
// - Anyone who receives any part of it from you must also receive these terms,
//   or the URL above, together with the "Required Notice" line carried by the
//   LICENSE file.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE COMES AS IS, WITHOUT ANY WARRANTY OR
// CONDITION, AND THE LICENSOR WILL NOT BE LIABLE TO YOU FOR ANY DAMAGES ARISING
// OUT OF THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY KIND OF
// LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

import { assertEquals } from "@std/assert";
import { matchesOf } from "@scribe/foundation/src/trigger/core/match.ts";
import type { RegisteredTrigger } from "@scribe/foundation/src/trigger/core/registry.ts";
import { eventFrom, type TriggerEvent } from "@scribe/foundation/src/trigger/core/wire.ts";
import type { TriggerEventRow } from "@scribe/foundation/src/trigger/db/tables.ts";

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

Deno.test("a declaration on another table is not delivered", () => {
  assertEquals(matchesOf([trigger({ table: "invoices" })], event()), []);
});

Deno.test("a declaration on another operation is not delivered", () => {
  assertEquals(matchesOf([trigger({ op: "insert" })], event()), []);
});

Deno.test("a declaration watching the row is delivered once, without a column", () => {
  const matches = matchesOf([trigger()], event());

  assertEquals(matches.length, 1);
  assertEquals(matches[0].field, null);
});

Deno.test("the row and one of its columns are both delivered by one write", () => {
  const matches = matchesOf(
    [trigger(), trigger({ name: "orders:status", fields: ["status"] })],
    event(),
  );

  assertEquals(matches.map((match) => [match.trigger.name, match.field]), [
    ["orders:update", null],
    ["orders:status", "status"],
  ]);
});

Deno.test("a column that holds the value it held is not delivered", () => {
  const matches = matchesOf(
    [trigger({ name: "orders:total", fields: ["total"] })],
    event(),
  );

  assertEquals(matches, []);
});

Deno.test("a declaration watching two columns is delivered once per column that moved", () => {
  const matches = matchesOf(
    [trigger({ name: "orders:status+total", fields: ["status", "total"] })],
    event({ after: { id: "order-1", status: "paid", total: 25 } }),
  );

  assertEquals(matches.map((match) => match.field), ["status", "total"]);
});

Deno.test("a transition is delivered when both of its bounds are met", () => {
  const matches = matchesOf(
    [trigger({ fields: ["status"], when: { from: "pending", to: "paid" } })],
    event(),
  );

  assertEquals(matches.length, 1);
});

Deno.test("a transition leaving another value is not delivered", () => {
  const matches = matchesOf(
    [trigger({ fields: ["status"], when: { from: "draft", to: "paid" } })],
    event(),
  );

  assertEquals(matches, []);
});

Deno.test("a transition naming only what it reaches ignores where the column came from", () => {
  const matches = matchesOf(
    [trigger({ fields: ["status"], when: { to: "paid" } })],
    event({ before: { id: "order-1", status: "draft", total: 10 } }),
  );

  assertEquals(matches.length, 1);
});

Deno.test("a column that gained a value is delivered, and its absence reads as null", () => {
  const matches = matchesOf(
    [trigger({ fields: ["status"], when: { from: null, to: "paid" } })],
    event({ before: { id: "order-1", total: 10 } }),
  );

  assertEquals(matches.length, 1);
});

Deno.test("a structured column is compared on what it holds, not on its identity", () => {
  const matches = matchesOf(
    [trigger({ name: "orders:lines", fields: ["lines"] })],
    event({
      before: { id: "order-1", lines: [{ sku: "a" }] },
      after: { id: "order-1", lines: [{ sku: "a" }] },
    }),
  );

  assertEquals(matches, []);
});

Deno.test("a deletion is read with the row it removed and no row after it", () => {
  const read = eventFrom(row({ op: "delete", before: { id: "order-1" }, after: null }));

  assertEquals(read?.op, "delete");
  assertEquals(read?.key, "order-1");
  assertEquals(read?.after, null);
  assertEquals(read?.at, PAID);
});

Deno.test("a row whose operation is none of the three cannot be read", () => {
  assertEquals(eventFrom(row({ op: "truncate" })), null);
});
