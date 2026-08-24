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

import { Audience } from "@scribe/audience/lib/src/core/declaration.ts";
import { audiencesOf, forgetMember } from "@scribe/audience/lib/src/core/member.ts";
import { installAudienceMock } from "@scribe/audience/tests/testing/mock.ts";
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
