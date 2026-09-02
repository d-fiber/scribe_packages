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

import "@scribe/runtime/scholium/runner.ts";
import { equals, expect, expectLater, isA, isFalse, isTrue, Scribe, throwsA } from "@scribe/alchemy/test";
import { DateTime, Duration } from "@scribe/alchemy";
import { AudienceError } from "../../lib/contracts/audience.ts";
import { Audience } from "../../lib/src/core/declaration.ts";
import { AudienceKeyError, AudienceMemberError } from "../../lib/src/core/key.ts";
import { installAudienceMock } from "../testing/mock.ts";

const declaration = Audience.for("declaration");
const banned = declaration.global("declaration-banned");
const editors = declaration.namespaced("declaration-editors");
const invited = declaration.namespaced("declaration-invited", { ttl: Duration.days(7) });

Scribe.test("a global audience holds the members it was given", async () => {
  const audiences = installAudienceMock();

  try {
    expect(await banned.has("a1"), isFalse);

    expect((await banned.add("a1")).ok, isTrue);
    expect(await banned.has("a1"), isTrue);
    expect(await banned.has("a2"), isFalse);
  } finally {
    audiences.restore();
  }
});

Scribe.test("a scope holds its own members and reads none of another's", async () => {
  const audiences = installAudienceMock();

  try {
    expect((await editors.in("p1").add("a1")).ok, isTrue);

    expect(await editors.in("p1").has("a1"), isTrue);
    expect(await editors.in("p2").has("a1"), isFalse);
  } finally {
    audiences.restore();
  }
});

Scribe.test("a nested scope is a different audience from the one it narrows", async () => {
  const audiences = installAudienceMock();

  try {
    expect((await editors.in("p1", "backend").add("a1")).ok, isTrue);

    expect(await editors.in("p1", "backend").has("a1"), isTrue);
    expect(await editors.in("p1").has("a1"), isFalse);
  } finally {
    audiences.restore();
  }
});

Scribe.test("a member put in twice is held once, with the last expiry", async () => {
  const audiences = installAudienceMock();

  try {
    await editors.in("p1").add("a1", { ttl: Duration.minutes(5) });
    await editors.in("p1").add("a1", { ttl: null });

    expect(audiences.memberships().length, equals(1));
    expect(audiences.memberships()[0].expires_at, equals(null));
  } finally {
    audiences.restore();
  }
});

Scribe.test("a membership that has expired stops answering", async () => {
  const audiences = installAudienceMock();

  try {
    audiences.seed([{
      feature: "declaration",
      audience: "declaration-editors:p1",
      member: "a1",
      created_at: 1,
      expires_at: DateTime.now().millisecondsSinceEpoch - 1,
    }]);

    expect(await editors.in("p1").has("a1"), isFalse);
    expect((await editors.in("p1").members()).members, equals([]));
  } finally {
    audiences.restore();
  }
});

Scribe.test("the declared delay is what a member inherits when the caller names none", async () => {
  const audiences = installAudienceMock();

  try {
    const before = DateTime.now().millisecondsSinceEpoch;
    await invited.in("p1").add("a1");

    const expiresAt = audiences.memberships()[0].expires_at as number;
    expect(expiresAt >= before + Duration.days(7).inMilliseconds, isTrue, "the declared delay must be applied");
  } finally {
    audiences.restore();
  }
});

Scribe.test("taking a member out that was never in answers not found", async () => {
  const audiences = installAudienceMock();

  try {
    const removed = await editors.in("p1").remove("a1");

    expect(removed.ok, isFalse);
    expect(removed.ok ? null : removed.error, equals(AudienceError.NotFound));
  } finally {
    audiences.restore();
  }
});

Scribe.test("retiming a member that was never in answers not found", async () => {
  const audiences = installAudienceMock();

  try {
    const retimed = await editors.in("p1").ttl("a1", null);

    expect(retimed.ok, isFalse);
    expect(retimed.ok ? null : retimed.error, equals(AudienceError.NotFound));
  } finally {
    audiences.restore();
  }
});

Scribe.test("emptying an audience leaves the other scopes alone", async () => {
  const audiences = installAudienceMock();

  try {
    await editors.in("p1").add("a1");
    await editors.in("p2").add("a2");

    expect((await editors.in("p1").clear()).ok, isTrue);
    expect((await editors.in("p1").members()).members, equals([]));
    expect((await editors.in("p2").members()).members, equals(["a2"]));
  } finally {
    audiences.restore();
  }
});

Scribe.test("adding many members at once writes every one of them", async () => {
  const audiences = installAudienceMock();

  try {
    const added = await editors.in("p1").addMany(["a1", "a2", "a3"]);

    expect(added.ok, isTrue);
    expect((await editors.in("p1").members()).members, equals(["a1", "a2", "a3"]));
  } finally {
    audiences.restore();
  }
});

Scribe.test("adding an empty list of members is a no-op that touches nothing", async () => {
  const audiences = installAudienceMock();

  try {
    const added = await editors.in("p1").addMany([]);

    expect(added.ok, isTrue);
    expect(audiences.memberships().length, equals(0));
  } finally {
    audiences.restore();
  }
});

Scribe.test("addMany applies the declared delay the same way add does", async () => {
  const audiences = installAudienceMock();

  try {
    const before = DateTime.now().millisecondsSinceEpoch;
    await invited.in("p1").addMany(["a1", "a2"]);

    for (const row of audiences.memberships()) {
      expect(row.expires_at as number >= before + Duration.days(7).inMilliseconds, isTrue);
    }
  } finally {
    audiences.restore();
  }
});

Scribe.test("reaping an audience removes only its own expired rows", async () => {
  const audiences = installAudienceMock();

  try {
    audiences.seed([
      { feature: "declaration", audience: "declaration-editors:p1", member: "a1", created_at: 1, expires_at: 1 },
      { feature: "declaration", audience: "declaration-editors:p1", member: "a2", created_at: 1, expires_at: null },
      { feature: "declaration", audience: "declaration-editors:p2", member: "b1", created_at: 1, expires_at: 1 },
    ]);

    const reaped = await editors.in("p1").reap();

    expect(reaped.ok, isTrue);
    expect(reaped.ok ? reaped.data : -1, equals(1));
    expect(audiences.memberships().map((row) => row.member), equals(["a2", "b1"]));
  } finally {
    audiences.restore();
  }
});

Scribe.test("a name taken twice under the same feature is refused", () => {
  declaration.global("declaration-twice");

  expect(() => declaration.namespaced("declaration-twice"), throwsA(isA(TypeError)));
});

Scribe.test("the same name under two different features is not a collision", () => {
  const a = Audience.for("feature-a").global("shared-name");
  const b = Audience.for("feature-b").global("shared-name");

  expect(a.name, equals(b.name));
});

Scribe.test("a name, a scope or a feature a key cannot hold is refused", () => {
  expect(() => declaration.global("bad name"), throwsA(isA(AudienceKeyError)));
  expect(() => declaration.global(""), throwsA(isA(AudienceKeyError)));
  expect(() => editors.in("p1:p2"), throwsA(isA(AudienceKeyError)));
  expect(() => Audience.for("bad feature"), throwsA(isA(AudienceKeyError)));
});

Scribe.test("a member carrying a control character or the cache separator is refused", async () => {
  const audiences = installAudienceMock();

  try {
    await expectLater(() => banned.has("a1\n"), throwsA(isA(AudienceMemberError)));
    await expectLater(() => banned.add("a1|x"), throwsA(isA(AudienceMemberError)));
  } finally {
    audiences.restore();
  }
});
