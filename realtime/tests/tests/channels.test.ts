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
import { allOf, equals, expect, isA, Scribe, throwsA, withMessage } from "@scribe/alchemy/test";
import { Realtime } from "@scribe/realtime";

interface Order {
  orderId: string;
  total: number;
}

const ACCOUNT = "11111111-1111-1111-1111-111111111111";

const order = Realtime.granted<Order>("shape_order", { key: "orderId" });

Scribe.test("the broadcast channel is the declared name, bare", () => {
  expect(order.all.channel, equals("shape_order"));
});

Scribe.test("an account channel carries the account after a colon", () => {
  expect(order.to(ACCOUNT).channel, equals(`shape_order:${ACCOUNT}`));
});

Scribe.test("a topic channel is marked so it can never look like an account", () => {
  expect(order.topic("seller").channel, equals("shape_order:#seller"));
});

Scribe.test("narrowing an account channel keeps the account in second place", () => {
  expect(order.to(ACCOUNT).topic("warehouse").channel, equals(`shape_order:${ACCOUNT}:warehouse`));
});

Scribe.test("the second part of a topic channel never matches an account", () => {
  const parts = order.topic("seller").channel.split(":");
  expect(parts[1].startsWith("#"), equals(true));
});

Scribe.test("two declarations never reach the same channel", () => {
  const other = Realtime.granted<Order>("shape_invoice", { key: "orderId" });
  expect(order.topic("seller").channel === other.topic("seller").channel, equals(false));
});

Scribe.test("a topic with a colon in it is refused", () => {
  expect(() => order.topic("a:b"), throwsA(allOf(isA(TypeError), withMessage("is not a usable name"))));
});

Scribe.test("a topic longer than 64 characters is refused", () => {
  expect(() => order.topic("t".repeat(65)), throwsA(allOf(isA(TypeError), withMessage("is not a usable name"))));
});

Scribe.test("a topic is refused on an account channel too", () => {
  expect(() => order.to(ACCOUNT).topic("a b"), throwsA(allOf(isA(TypeError), withMessage("is not a usable name"))));
});
