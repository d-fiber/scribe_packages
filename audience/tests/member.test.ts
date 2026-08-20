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
import { audiencesOf, forgetMember } from "@scribe/audience/src/core/member.ts";
import { installAudienceMock } from "@scribe/audience/testing/mock.ts";
import { assert, assertEquals, assertFalse } from "@std/assert";

const banned = Audience.plain("member-banned");
const editors = Audience.keyed("member-editors");

Deno.test("a member is listed under every audience it belongs to", async () => {
  const audiences = installAudienceMock();

  try {
    await banned.add("a1");
    await editors.in("p1").add("a1");
    await editors.in("p2").add("a2");

    assertEquals(await audiencesOf("a1"), ["member-banned", "member-editors:p1"]);
  } finally {
    audiences.restore();
  }
});

Deno.test("a member that is forgotten belongs nowhere, cache included", async () => {
  const audiences = installAudienceMock();

  try {
    await banned.add("a1");
    await editors.in("p1").add("a1");
    assert(await banned.has("a1"));
    assert(await editors.in("p1").has("a1"));

    assert((await forgetMember("a1")).ok);
    assertFalse(await banned.has("a1"), "forgetting must drop what the cache holds");
    assertFalse(await editors.in("p1").has("a1"));
    assertEquals(await audiencesOf("a1"), []);
  } finally {
    audiences.restore();
  }
});

Deno.test("forgetting a member leaves the others where they are", async () => {
  const audiences = installAudienceMock();

  try {
    await editors.in("p1").add("a1");
    await editors.in("p1").add("a2");

    await forgetMember("a1");
    assertEquals(await editors.in("p1").members(), ["a2"]);
  } finally {
    audiences.restore();
  }
});
