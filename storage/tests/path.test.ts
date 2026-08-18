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
import {
  defineStorage,
  image,
  Size,
  StoragePathError,
} from "@scribe/storage/mod.ts";
import { pathSegment } from "@scribe/storage/src/path/segment.ts";
import { parseTemplate } from "@scribe/storage/src/path/template.ts";

Deno.test("segment: the accepted alphabet is closed", () => {
  assertEquals(pathSegment("avatar-1_A"), "avatar-1_A");
  for (const bad of ["..", "a/b", "a b", "a.png", "", "é"]) {
    assertThrows(() => pathSegment(bad), StoragePathError);
  }
});

Deno.test("segment: traversal cannot be smuggled in", () => {
  assertThrows(() => pathSegment("../../etc"), StoragePathError);
  assertThrows(() => pathSegment("a/../b"), StoragePathError);
});

Deno.test("segment: an over-long segment is refused", () => {
  assertEquals(pathSegment("a".repeat(128)), "a".repeat(128));
  assertThrows(() => pathSegment("a".repeat(129)), StoragePathError);
});

Deno.test("template: named arguments are extracted in order", () => {
  const parsed = parseTemplate("brands/{brand}/stores/{store}");
  assertEquals(parsed.argNames, ["brand", "store"]);
});

Deno.test("template: {account} is not an argument, it comes from the session", () => {
  const parsed = parseTemplate("users/{account}");
  assertEquals(parsed.argNames, []);
});

Deno.test("define: a resource cannot take a name reserved by the folder API", () => {
  for (const reserved of ["list", "clear"]) {
    assertThrows(
      () =>
        defineStorage({
          path: "things/{account}",
          access: { read: "anyone", write: "users" },
          resources: {
            [reserved]: image({ extensions: ["png"], maxSize: Size.megabytes(1) }),
          },
        }),
      Error,
      reserved,
    );
  }
});
