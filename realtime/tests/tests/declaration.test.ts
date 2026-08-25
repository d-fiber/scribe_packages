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
import { Listen, Realtime } from "@scribe/realtime";

interface Order {
  orderId: string;
  total: number;
}

interface Keyed {
  id: string;
  label: string;
}

Deno.test("a declaration keeps the name it was given", () => {
  assertEquals(Realtime.granted<Order>("order", { key: "orderId" }).name, "order");
});

Deno.test("each factory carries its own openness", () => {
  assertEquals(Realtime.public<Keyed>("public_one").listen, Listen.Public);
  assertEquals(Realtime.authenticated<Keyed>("open_one").listen, Listen.Authenticated);
  assertEquals(Realtime.granted<Keyed>("closed_one").listen, Listen.Granted);
});

Deno.test("a declaration with no key falls back to id", () => {
  const channel = Realtime.public<Keyed>("fallback_key");
  assertEquals(channel.all.channel, "fallback_key");
});

Deno.test("a name that is not snake case is refused at the declaration", () => {
  assertThrows(
    () => Realtime.granted<Keyed>("Order"),
    TypeError,
    "must be lowercase snake_case",
  );
});

Deno.test("a name longer than 64 characters is refused", () => {
  assertThrows(
    () => Realtime.granted<Keyed>("o".repeat(65)),
    TypeError,
    "exceeds 64 characters",
  );
});

Deno.test("the same name declared twice with the same openness is accepted", () => {
  Realtime.granted<Keyed>("declared_twice_same");
  Realtime.granted<Keyed>("declared_twice_same");
});

Deno.test("the same name declared twice with two opennesses is refused", () => {
  Realtime.granted<Keyed>("declared_twice_apart");

  assertThrows(
    () => Realtime.public<Keyed>("declared_twice_apart"),
    TypeError,
    "is declared twice",
  );
});
