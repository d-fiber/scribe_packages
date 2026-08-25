// Copyright (C) 2026 Fiber
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0. If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
// - Combine it with files under any other licence, proprietary ones included,
//   and licence that larger work on your own terms.
//
// What you must do in return:
// - Keep this notice on every file you received it on.
// - Publish, under these same terms, the source of every file covered by them
//   that you distribute, including the ones you changed, so that whoever
//   receives your version can obtain that source.
// - Leave Fiber out of it: the name "Fiber", its branding, its logos and its
//   trademarks may not be used to endorse or promote what you build, and this
//   licence grants no right to them.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
// OR CONDITION OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
// NON-INFRINGEMENT. IN NO EVENT SHALL FIBER BE LIABLE FOR ANY DIRECT, INDIRECT,
// INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING BUT NOT
// LIMITED TO LOSS OF USE, DATA, PROFITS, OR BUSINESS INTERRUPTION) ARISING OUT
// OF OR RELATED TO THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY
// KIND OF LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

import { Duration } from "@scribe/alchemy";
import { AudienceError } from "../../lib/contracts/audience.ts";
import { Audience } from "../../lib/src/core/declaration.ts";
import { AudienceKeyError } from "../../lib/src/core/key.ts";
import { installAudienceMock } from "../testing/mock.ts";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

const banned = Audience.plain("declaration-banned");
const editors = Audience.keyed("declaration-editors");
const invited = Audience.keyed("declaration-invited", { ttl: Duration.days(7) });

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
    await editors.in("p1").add("a1", { ttl: Duration.minutes(5) });
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
    assert(expiresAt >= before + Duration.days(7).inMilliseconds, "the declared delay must be applied");
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
