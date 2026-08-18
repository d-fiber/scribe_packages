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

import "@scribe/core/testing/settings.ts";
import { assertEquals, assertThrows } from "@std/assert";
import { defineRealtime, event, isValidTopic } from "@scribe/realtime/mod.ts";

function declaring(entity: string, action = "update"): () => unknown {
  return () => defineRealtime({ entity, events: { e: event(action) } });
}

Deno.test("entity: snake_case lowercase only", () => {
  declaring("brand")();
  declaring("brand_store")();
  declaring("b2b_store")();

  for (const bad of ["Brand", "brand-store", "brand store", "2brand", "_brand", "", "brandé", "brand.store"]) {
    assertThrows(declaring(bad), TypeError);
  }
});

Deno.test("entity: 64 characters is the ceiling", () => {
  declaring("a".repeat(64))();
  assertThrows(declaring("a".repeat(65)), TypeError);
});

Deno.test("action: same alphabet as the entity", () => {
  declaring("thing", "sign_out")();
  for (const bad of ["Sign", "sign-out", "sign out", "1sign", "", "signé"]) {
    assertThrows(declaring("thing", bad), TypeError);
  }
});

Deno.test("action: 32 characters is the ceiling, tighter than the entity", () => {
  declaring("thing", "a".repeat(32))();
  assertThrows(declaring("thing", "a".repeat(33)), TypeError);
});

Deno.test("name errors say what is expected", () => {
  const thrown = assertThrows(declaring("Brand"), TypeError) as TypeError;
  assertEquals(thrown.message.includes("lowercase snake_case"), true);

  const tooLong = assertThrows(declaring("a".repeat(65)), TypeError) as TypeError;
  assertEquals(tooLong.message.includes("exceeds 64 characters"), true);
});

Deno.test("topic: a wider alphabet than entity names, on purpose", () => {
  for (const good of ["room", "Room", "room-7", "room_7", "ROOM7", "7room", "a"]) {
    assertEquals(isValidTopic(good), true, good);
  }
  for (const bad of ["room 7", "room/7", "room.7", "", "roomé", "room!"]) {
    assertEquals(isValidTopic(bad), false, bad);
  }
});

Deno.test("topic: 64 characters is the ceiling, matching the SQL check", () => {
  assertEquals(isValidTopic("a".repeat(64)), true);
  assertEquals(isValidTopic("a".repeat(65)), false);
});
