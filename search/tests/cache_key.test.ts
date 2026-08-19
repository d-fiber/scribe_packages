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

import { assertEquals, assertNotEquals } from "@std/assert";
import { digest, roundCoord, stableKey, timeBucket } from "@scribe/search/mod.ts";

Deno.test("two objects meaning the same thing write the same key whatever their field order", () => {
  assertEquals(stableKey({ a: 1, b: 2 }), stableKey({ b: 2, a: 1 }));
});

Deno.test("the key is sorted at every depth, not only at the top", () => {
  assertEquals(stableKey({ outer: { a: 1, b: 2 } }), stableKey({ outer: { b: 2, a: 1 } }));
});

Deno.test("a list of scalars means the same whichever order a caller passed it in", () => {
  assertEquals(stableKey({ status: ["open", "closed"] }), stableKey({ status: ["closed", "open"] }));
});

Deno.test("a list of objects keeps its order, since there the order is the meaning", () => {
  assertNotEquals(
    stableKey([{ rank: "desc" }, { name: "asc" }]),
    stableKey([{ name: "asc" }, { rank: "desc" }]),
  );
});

Deno.test("two values that differ get different keys", () => {
  assertNotEquals(stableKey({ text: "rosa" }), stableKey({ text: "lino" }));
});

Deno.test("a digest is eight hexadecimal characters, and follows what the value means", () => {
  assertEquals(digest({ a: 1 }).length, 8);
  assertEquals(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
  assertNotEquals(digest({ a: 1 }), digest({ a: 2 }));
});

Deno.test("every moment inside one bucket rounds down to the same start", () => {
  assertEquals(timeBucket(1_000, 60_000), 0);
  assertEquals(timeBucket(59_999, 60_000), 0);
  assertEquals(timeBucket(60_000, 60_000), 60_000);
  assertEquals(timeBucket(119_999, 60_000), 60_000);
});

Deno.test("two nearby callers round onto one coordinate, and distant ones do not", () => {
  assertEquals(roundCoord(48.8564, 2), roundCoord(48.8576, 2));
  assertNotEquals(roundCoord(48.8564, 3), roundCoord(48.8576, 3));
});
