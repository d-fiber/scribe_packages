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

import { assertEquals, assertThrows } from "@std/assert";
import { Realtime } from "@scribe/realtime";
import { installRealtimeMock } from "../testing/mock.ts";

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
