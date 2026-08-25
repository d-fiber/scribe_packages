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

import { assertEquals, assertThrows } from "@std/assert";
import { Realtime } from "@scribe/realtime";

interface Order {
  orderId: string;
  total: number;
}

const ACCOUNT = "11111111-1111-1111-1111-111111111111";

const order = Realtime.granted<Order>("shape_order", { key: "orderId" });

Deno.test("the broadcast channel is the declared name, bare", () => {
  assertEquals(order.all.channel, "shape_order");
});

Deno.test("an account channel carries the account after a colon", () => {
  assertEquals(order.to(ACCOUNT).channel, `shape_order:${ACCOUNT}`);
});

Deno.test("a topic channel is marked so it can never look like an account", () => {
  assertEquals(order.topic("seller").channel, "shape_order:#seller");
});

Deno.test("narrowing an account channel keeps the account in second place", () => {
  assertEquals(
    order.to(ACCOUNT).topic("warehouse").channel,
    `shape_order:${ACCOUNT}:warehouse`,
  );
});

Deno.test("the second part of a topic channel never matches an account", () => {
  const parts = order.topic("seller").channel.split(":");
  assertEquals(parts[1].startsWith("#"), true);
});

Deno.test("two declarations never reach the same channel", () => {
  const other = Realtime.granted<Order>("shape_invoice", { key: "orderId" });
  assertEquals(order.topic("seller").channel === other.topic("seller").channel, false);
});

Deno.test("a topic with a colon in it is refused", () => {
  assertThrows(() => order.topic("a:b"), TypeError, "is not a usable name");
});

Deno.test("a topic longer than 64 characters is refused", () => {
  assertThrows(() => order.topic("t".repeat(65)), TypeError, "is not a usable name");
});

Deno.test("a topic is refused on an account channel too", () => {
  assertThrows(() => order.to(ACCOUNT).topic("a b"), TypeError, "is not a usable name");
});
