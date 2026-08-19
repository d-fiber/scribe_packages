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
import { parsePath } from "@scribe/foundation/src/trigger/core/path.ts";

Deno.test("a path names its table and the parameter its key is handed under", () => {
  assertEquals(parsePath("orders/{orderId}"), {
    table: "orders",
    param: "orderId",
    field: null,
  });
});

Deno.test("a third segment is the column to watch", () => {
  assertEquals(parsePath("orders/{orderId}/status"), {
    table: "orders",
    param: "orderId",
    field: "status",
  });
});

Deno.test("a path that stops at the table is refused", () => {
  assertThrows(
    () => parsePath("orders"),
    Error,
    "a path is written <table>/{<param>}[/<field>]",
  );
});

Deno.test("a path with a fourth segment is refused", () => {
  assertThrows(() => parsePath("orders/{orderId}/status/history"), Error);
});

Deno.test("a second segment without braces is not a parameter", () => {
  assertThrows(
    () => parsePath("orders/orderId"),
    Error,
    '"orderId" is not a parameter',
  );
});

Deno.test("an empty parameter is refused", () => {
  assertThrows(() => parsePath("orders/{}"), Error);
});

Deno.test("a path without a table is refused", () => {
  assertThrows(() => parsePath("/{orderId}"), Error, "the table is missing");
});

Deno.test("a path ending on a slash is refused", () => {
  assertThrows(() => parsePath("orders/{orderId}/"), Error, "the field is empty");
});
