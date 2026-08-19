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

import { assertEquals, assertThrows } from "@std/assert";
import { Realtime } from "@scribe/realtime/mod.ts";
import { installRealtimeMock } from "@scribe/realtime/testing/mock.ts";

interface Order {
  orderId: string;
  total: number;
}

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const ROW: Order = { orderId: "o-1", total: 42 };

const order = Realtime.granted<Order>("emit_order", { key: "orderId" });

Deno.test("the three actions travel under the names they are called by", async () => {
  const sent = installRealtimeMock();

  await order.all.insert(ROW);
  await order.all.update(ROW);
  await order.all.delete(ROW);

  assertEquals(sent.rows.map((row) => row.action), ["insert", "update", "delete"]);
  sent.restore();
});

Deno.test("an action of the project's own choosing travels as it was written", async () => {
  const sent = installRealtimeMock();

  await order.all.emit("shipped", ROW);

  assertEquals(sent.rows[0].action, "shipped");
  sent.restore();
});

Deno.test("an action that is not snake case is refused before anything is sent", () => {
  const sent = installRealtimeMock();

  assertThrows(() => order.all.emit("Shipped", ROW), TypeError, "must be lowercase snake_case");
  assertEquals(sent.rows.length, 0);
  sent.restore();
});

Deno.test("the whole payload travels, not only its identifier", async () => {
  const sent = installRealtimeMock();

  await order.all.update(ROW);

  assertEquals(sent.rows[0].payload, { orderId: "o-1", total: 42 });
  sent.restore();
});

Deno.test("the identifier is pulled from the field the declaration named", async () => {
  const sent = installRealtimeMock();

  await order.all.update(ROW);

  assertEquals(sent.rows[0].entityId, "o-1");
  sent.restore();
});

Deno.test("a payload whose identifier is empty is dropped instead of sent", async () => {
  const sent = installRealtimeMock();

  const left = await order.all.update({ orderId: "", total: 1 });

  assertEquals(left, false);
  assertEquals(sent.rows.length, 0);
  sent.restore();
});

Deno.test("each destination addresses its own channel", async () => {
  const sent = installRealtimeMock();

  await order.all.update(ROW);
  await order.to(ACCOUNT).update(ROW);
  await order.topic("seller").update(ROW);
  await order.to(ACCOUNT).topic("warehouse").update(ROW);

  assertEquals(sent.rows.map((row) => row.channel), [
    "emit_order",
    `emit_order:${ACCOUNT}`,
    "emit_order:#seller",
    `emit_order:${ACCOUNT}:warehouse`,
  ]);
  sent.restore();
});

Deno.test("what the transport answers is what the caller sees", async () => {
  const refused = installRealtimeMock(false);

  assertEquals(await order.all.update(ROW), false);
  refused.restore();
});

Deno.test("an emission with no transport registered is dropped, never thrown", async () => {
  const sent = installRealtimeMock();
  sent.restore();

  assertEquals(await order.all.update(ROW), false);
});
