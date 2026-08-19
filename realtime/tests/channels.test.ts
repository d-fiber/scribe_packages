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

interface Order {
  orderId: string;
  total: number;
}

const ACCOUNT = "11111111-1111-1111-1111-111111111111";

const order = Realtime.granted<Order>("shape_order", { key: "orderId" });

Deno.test("the broadcast channel is the declared name, bare", () => {
  assertEquals(order.all.channel, "shape_order");
});

Deno.test("an account channel carries the account after a colon", () => {
  assertEquals(order.to(ACCOUNT).channel, `shape_order:${ACCOUNT}`);
});

Deno.test("a topic channel is marked so it can never look like an account", () => {
  assertEquals(order.topic("seller").channel, "shape_order:#seller");
});

Deno.test("narrowing an account channel keeps the account in second place", () => {
  assertEquals(
    order.to(ACCOUNT).topic("warehouse").channel,
    `shape_order:${ACCOUNT}:warehouse`,
  );
});

Deno.test("the second part of a topic channel never matches an account", () => {
  const parts = order.topic("seller").channel.split(":");
  assertEquals(parts[1].startsWith("#"), true);
});

Deno.test("two declarations never reach the same channel", () => {
  const other = Realtime.granted<Order>("shape_invoice", { key: "orderId" });
  assertEquals(order.topic("seller").channel === other.topic("seller").channel, false);
});

Deno.test("a topic with a colon in it is refused", () => {
  assertThrows(() => order.topic("a:b"), TypeError, "is not a usable name");
});

Deno.test("a topic longer than 64 characters is refused", () => {
  assertThrows(() => order.topic("t".repeat(65)), TypeError, "is not a usable name");
});

Deno.test("a topic is refused on an account channel too", () => {
  assertThrows(() => order.to(ACCOUNT).topic("a b"), TypeError, "is not a usable name");
});
