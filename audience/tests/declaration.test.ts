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

import { Time } from "@scribe/core/contracts/common/time.ts";
import { AudienceError } from "@scribe/audience/contracts/audience.ts";
import { Audience } from "@scribe/audience/src/core/declaration.ts";
import { AudienceKeyError } from "@scribe/audience/src/core/key.ts";
import { installAudienceMock } from "@scribe/audience/testing/mock.ts";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

const banned = Audience.plain("declaration-banned");
const editors = Audience.keyed("declaration-editors");
const invited = Audience.keyed("declaration-invited", { ttl: Time.days(7) });

Deno.test("a plain audience holds the members it was given", async () => {
  const audiences = installAudienceMock();

  try {
    assertFalse(await banned.has("a1"));

    assert((await banned.add("a1")).ok);
    assert(await banned.has("a1"));
    assertFalse(await banned.has("a2"), "only the member that was put in belongs");
  } finally {
    audiences.restore();
  }
});

Deno.test("a scope holds its own members and reads none of another's", async () => {
  const audiences = installAudienceMock();

  try {
    assert((await editors.in("p1").add("a1")).ok);

    assert(await editors.in("p1").has("a1"));
    assertFalse(await editors.in("p2").has("a1"), "another scope must not inherit the member");
  } finally {
    audiences.restore();
  }
});

Deno.test("a nested scope is a different audience from the one it narrows", async () => {
  const audiences = installAudienceMock();

  try {
    assert((await editors.in("p1", "backend").add("a1")).ok);

    assert(await editors.in("p1", "backend").has("a1"));
    assertFalse(await editors.in("p1").has("a1"));
  } finally {
    audiences.restore();
  }
});

Deno.test("a member put in twice is held once, with the last expiry", async () => {
  const audiences = installAudienceMock();

  try {
    await editors.in("p1").add("a1", { ttl: Time.minutes(5) });
    await editors.in("p1").add("a1", { ttl: null });

    assertEquals(audiences.memberships().length, 1);
    assertEquals(audiences.memberships()[0].expires_at, null);
  } finally {
    audiences.restore();
  }
});

Deno.test("a membership that has expired stops answering", async () => {
  const audiences = installAudienceMock();

  try {
    audiences.seed([{
      audience: "declaration-editors:p1",
      member: "a1",
      created_at: 1,
      expires_at: Date.now() - 1,
    }]);

    assertFalse(await editors.in("p1").has("a1"));
    assertEquals(await editors.in("p1").members(), []);
  } finally {
    audiences.restore();
  }
});

Deno.test("the declared delay is what a member inherits when the caller names none", async () => {
  const audiences = installAudienceMock();

  try {
    const before = Date.now();
    await invited.in("p1").add("a1");

    const expiresAt = audiences.memberships()[0].expires_at as number;
    assert(expiresAt >= before + Time.days(7).ms, "the declared delay must be applied");
  } finally {
    audiences.restore();
  }
});

Deno.test("taking a member out that was never in answers not found", async () => {
  const audiences = installAudienceMock();

  try {
    const removed = await editors.in("p1").remove("a1");

    assertFalse(removed.ok);
    assertEquals(removed.ok ? null : removed.error, AudienceError.NotFound);
  } finally {
    audiences.restore();
  }
});

Deno.test("retiming a member that was never in answers not found", async () => {
  const audiences = installAudienceMock();

  try {
    const retimed = await editors.in("p1").ttl("a1", null);

    assertFalse(retimed.ok);
    assertEquals(retimed.ok ? null : retimed.error, AudienceError.NotFound);
  } finally {
    audiences.restore();
  }
});

Deno.test("emptying an audience leaves the other scopes alone", async () => {
  const audiences = installAudienceMock();

  try {
    await editors.in("p1").add("a1");
    await editors.in("p2").add("a2");

    assert((await editors.in("p1").clear()).ok);
    assertEquals(await editors.in("p1").members(), []);
    assertEquals(await editors.in("p2").members(), ["a2"]);
  } finally {
    audiences.restore();
  }
});

Deno.test("a name taken twice is refused", () => {
  Audience.plain("declaration-twice");

  assertThrows(() => Audience.keyed("declaration-twice"), TypeError);
});

Deno.test("a name or a scope a key cannot hold is refused", () => {
  assertThrows(() => Audience.plain("bad name"), AudienceKeyError);
  assertThrows(() => Audience.plain(""), AudienceKeyError);
  assertThrows(() => editors.in("p1:p2"), AudienceKeyError);
});
