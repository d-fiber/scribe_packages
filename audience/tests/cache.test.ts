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

import { Audience } from "@scribe/audience/src/core/declaration.ts";
import { forgetMembership } from "@scribe/audience/src/runtime/cache.ts";
import { installAudienceMock } from "@scribe/audience/testing/mock.ts";
import { assert, assertFalse } from "@std/assert";

const editors = Audience.keyed("cache-editors");

Deno.test("a membership asked about once is answered from the cache until something drops it", async () => {
  const audiences = installAudienceMock();

  try {
    assertFalse(await editors.in("p1").has("a1"));

    audiences.seed([{ audience: "cache-editors:p1", member: "a1", created_at: 1, expires_at: null }]);
    assertFalse(await editors.in("p1").has("a1"), "a row written behind the package must not be seen at once");

    await forgetMembership("cache-editors:p1", "a1");
    assert(await editors.in("p1").has("a1"));
  } finally {
    audiences.restore();
  }
});

Deno.test("putting a member in is seen by the next question", async () => {
  const audiences = installAudienceMock();

  try {
    assertFalse(await editors.in("p1").has("a1"));

    await editors.in("p1").add("a1");
    assert(await editors.in("p1").has("a1"), "putting a member in must drop what the cache holds");
  } finally {
    audiences.restore();
  }
});

Deno.test("taking a member out is seen by the next question", async () => {
  const audiences = installAudienceMock();

  try {
    await editors.in("p1").add("a1");
    assert(await editors.in("p1").has("a1"));

    await editors.in("p1").remove("a1");
    assertFalse(await editors.in("p1").has("a1"), "taking a member out must drop what the cache holds");
  } finally {
    audiences.restore();
  }
});

Deno.test("emptying an audience is seen by the next question", async () => {
  const audiences = installAudienceMock();

  try {
    await editors.in("p1").add("a1");
    assert(await editors.in("p1").has("a1"));

    await editors.in("p1").clear();
    assertFalse(await editors.in("p1").has("a1"), "emptying must drop what the cache holds");
  } finally {
    audiences.restore();
  }
});
