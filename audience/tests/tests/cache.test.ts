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
import { equals, expect, isFalse, isTrue, Scribe } from "@scribe/alchemy/test";
import { Audience } from "../../lib/src/core/declaration.ts";
import { forgetMembership } from "../../lib/src/runtime/cache.ts";
import { installAudienceMock } from "../testing/mock.ts";
const editors = Audience.for("cache").namespaced("cache-editors");

Scribe.test("a membership asked about once is answered from the cache until something drops it", async () => {
  const audiences = installAudienceMock();

  try {
    expect(await editors.in("p1").has("a1"), isFalse);

    audiences.seed([{ feature: "cache", audience: "cache-editors:p1", member: "a1", created_at: 1, expires_at: null }]);
    expect(await editors.in("p1").has("a1"), isFalse);

    await forgetMembership("cache-editors:p1", "a1");
    expect(await editors.in("p1").has("a1"), isTrue);
  } finally {
    audiences.restore();
  }
});

Scribe.test("putting a member in is seen by the next question", async () => {
  const audiences = installAudienceMock();

  try {
    expect(await editors.in("p1").has("a1"), isFalse);

    await editors.in("p1").add("a1");
    expect(await editors.in("p1").has("a1"), isTrue, "putting a member in must drop what the cache holds");
  } finally {
    audiences.restore();
  }
});

Scribe.test("taking a member out is seen by the next question", async () => {
  const audiences = installAudienceMock();

  try {
    await editors.in("p1").add("a1");
    expect(await editors.in("p1").has("a1"), isTrue);

    await editors.in("p1").remove("a1");
    expect(await editors.in("p1").has("a1"), isFalse);
  } finally {
    audiences.restore();
  }
});

Scribe.test("emptying an audience is seen by the next question", async () => {
  const audiences = installAudienceMock();

  try {
    await editors.in("p1").add("a1");
    expect(await editors.in("p1").has("a1"), isTrue);

    await editors.in("p1").clear();
    expect(await editors.in("p1").has("a1"), isFalse);
  } finally {
    audiences.restore();
  }
});

Scribe.test("emptying a huge audience does not evict an unrelated audience's cache entries", async () => {
  const audiences = installAudienceMock();

  try {
    await editors.in("p1").add("a1");
    await editors.in("p2").add("a2");
    expect(await editors.in("p1").has("a1"), isTrue);
    expect(await editors.in("p2").has("a2"), isTrue);

    await editors.in("p1").clear();

    expect(await editors.in("p1").has("a1"), isFalse, "the cleared scope forgets what it held");
    expect(await editors.in("p2").has("a2"), isTrue, "an unrelated scope's cache entry survives a sibling's clear");
  } finally {
    audiences.restore();
  }
});

Scribe.test("two clears in immediate succession each still invalidate what came before", async () => {
  const audiences = installAudienceMock();

  try {
    await editors.in("p1").add("a1");
    await editors.in("p1").clear();
    await editors.in("p1").add("a2");
    await editors.in("p1").clear();

    expect(await editors.in("p1").has("a2"), isFalse, "the second clear must invalidate what the first one did not see");
  } finally {
    audiences.restore();
  }
});

Scribe.test("adding many members at once is seen by the next question, for every member added", async () => {
  const audiences = installAudienceMock();

  try {
    expect((await editors.in("p1").addMany(["a1", "a2", "a3"])).ok, isTrue);

    expect(await editors.in("p1").has("a1"), isTrue);
    expect(await editors.in("p1").has("a2"), isTrue);
    expect(await editors.in("p1").has("a3"), isTrue);
  } finally {
    audiences.restore();
  }
});

Scribe.test("a scope's page reads its own members and none of another's", async () => {
  const audiences = installAudienceMock();

  try {
    await editors.in("p1").addMany(["a1", "a2"]);
    await editors.in("p2").addMany(["b1"]);

    expect((await editors.in("p1").members()).members, equals(["a1", "a2"]));
    expect((await editors.in("p2").members()).members, equals(["b1"]));
  } finally {
    audiences.restore();
  }
});
