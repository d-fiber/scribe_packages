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
import { assertEquals } from "@std/assert";
import { defineRealtime, event } from "@scribe/realtime/mod.ts";

const scopesOf = (e: object) => Object.keys(e).sort();

Deno.test("define: with no restriction an event carries all three scopes", () => {
  const d = defineRealtime({ entity: "thing", events: { updated: event("update") } });
  assertEquals(scopesOf(d.updated), ["all", "to", "topic"]);
});

Deno.test("define: an entity-level restriction applies to every event", () => {
  const d = defineRealtime({
    entity: "thing",
    scopes: ["to"],
    events: { a: event("update"), b: event("delete") },
  });
  assertEquals(scopesOf(d.a), ["to"]);
  assertEquals(scopesOf(d.b), ["to"]);
});

Deno.test("define: an event-level restriction wins over the entity one", () => {
  const d = defineRealtime({
    entity: "thing",
    scopes: ["to"],
    events: {
      narrow: event("update"),
      wide: event("archived", { scopes: ["to", "all"] }),
    },
  });
  assertEquals(scopesOf(d.narrow), ["to"]);
  assertEquals(scopesOf(d.wide), ["all", "to"]);
});

Deno.test("define: an empty scopes list falls back instead of yielding nothing", () => {
  const d = defineRealtime({
    entity: "thing",
    scopes: [],
    events: { a: event("update") },
  });
  assertEquals(scopesOf(d.a), ["all", "to", "topic"]);
});

Deno.test("define: an event is frozen, its scopes cannot be swapped", () => {
  const d = defineRealtime({ entity: "thing", events: { a: event("update") } });
  assertEquals(Object.isFrozen(d.a), true);
});

Deno.test("define: events are independent, one restriction does not leak", () => {
  const d = defineRealtime({
    entity: "thing",
    events: {
      a: event("update", { scopes: ["to"] }),
      b: event("delete"),
    },
  });
  assertEquals(scopesOf(d.a), ["to"]);
  assertEquals(scopesOf(d.b), ["all", "to", "topic"]);
});

Deno.test("define: an entity with no event yields an empty surface", () => {
  assertEquals(Object.keys(defineRealtime({ entity: "thing", events: {} })), []);
});

Deno.test("define: two entities never share a dispatcher", () => {
  const a = defineRealtime({ entity: "one", events: { x: event("update") } });
  const b = defineRealtime({ entity: "two", events: { x: event("update") } });
  assertEquals(a.x.to === b.x.to, false);
});

Deno.test("event(): keeps the action and the declared scopes", () => {
  assertEquals(event("update"), { action: "update", scopes: undefined });
  assertEquals(event("update", { scopes: ["to"] }), { action: "update", scopes: ["to"] });
});
