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

import { assertEquals } from "@std/assert";
import { Realtime } from "@scribe/realtime";
import { installRealtimeMock } from "@scribe/realtime/tests/testing/mock.ts";

interface Item {
  id: string;
}

const item = Realtime.granted<Item>("mock_item");

Deno.test("the recording transport keeps every row in the order it was sent", async () => {
  const sent = installRealtimeMock();

  await item.all.insert({ id: "a" });
  await item.all.insert({ id: "b" });

  assertEquals(sent.rows.map((row) => row.entityId), ["a", "b"]);
  sent.restore();
});

Deno.test("the recording transport filters by channel", async () => {
  const sent = installRealtimeMock();

  await item.all.insert({ id: "a" });
  await item.topic("seller").insert({ id: "b" });

  assertEquals(sent.on("mock_item:#seller").map((row) => row.entityId), ["b"]);
  sent.restore();
});

Deno.test("restoring puts back the transport that was there before", async () => {
  const first = installRealtimeMock();
  const second = installRealtimeMock();

  await item.all.insert({ id: "a" });
  second.restore();
  await item.all.insert({ id: "b" });

  assertEquals(second.rows.map((row) => row.entityId), ["a"]);
  assertEquals(first.rows.map((row) => row.entityId), ["b"]);
  first.restore();
});
