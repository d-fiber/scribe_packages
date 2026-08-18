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

import { ownerOf, registerTableOwners } from "@scribe/foundation/src/database/schema.ts";
import { assertEquals } from "@std/assert";

Deno.test("a table nobody registered has no owner column", () => {
  registerTableOwners({ t__orders: "user_id" });

  assertEquals(ownerOf("t__orders"), "user_id");
  assertEquals(ownerOf("t__unregistered"), null);
});

Deno.test("an Object.prototype member is not mistaken for an owner column", () => {
  registerTableOwners({ t__orders: "user_id" });

  for (const inherited of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
    assertEquals(
      ownerOf(inherited),
      null,
      `${inherited} must not resolve through the prototype chain`,
    );
  }
});

Deno.test("a registered owner is always a string, never a borrowed function", () => {
  registerTableOwners({ toString: "user_id" });

  assertEquals(typeof ownerOf("toString"), "string");
  assertEquals(ownerOf("toString"), "user_id");
});
