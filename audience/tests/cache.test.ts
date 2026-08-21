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
