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
import { Listen, Realtime } from "@scribe/realtime/mod.ts";

interface Order {
  orderId: string;
  total: number;
}

interface Keyed {
  id: string;
  label: string;
}

Deno.test("a declaration keeps the name it was given", () => {
  assertEquals(Realtime.granted<Order>("order", { key: "orderId" }).name, "order");
});

Deno.test("each factory carries its own openness", () => {
  assertEquals(Realtime.public<Keyed>("public_one").listen, Listen.Public);
  assertEquals(Realtime.authenticated<Keyed>("open_one").listen, Listen.Authenticated);
  assertEquals(Realtime.granted<Keyed>("closed_one").listen, Listen.Granted);
});

Deno.test("a declaration with no key falls back to id", () => {
  const channel = Realtime.public<Keyed>("fallback_key");
  assertEquals(channel.all.channel, "fallback_key");
});

Deno.test("a name that is not snake case is refused at the declaration", () => {
  assertThrows(
    () => Realtime.granted<Keyed>("Order"),
    TypeError,
    "must be lowercase snake_case",
  );
});

Deno.test("a name longer than 64 characters is refused", () => {
  assertThrows(
    () => Realtime.granted<Keyed>("o".repeat(65)),
    TypeError,
    "exceeds 64 characters",
  );
});

Deno.test("the same name declared twice with the same openness is accepted", () => {
  Realtime.granted<Keyed>("declared_twice_same");
  Realtime.granted<Keyed>("declared_twice_same");
});

Deno.test("the same name declared twice with two opennesses is refused", () => {
  Realtime.granted<Keyed>("declared_twice_apart");

  assertThrows(
    () => Realtime.public<Keyed>("declared_twice_apart"),
    TypeError,
    "is declared twice",
  );
});
