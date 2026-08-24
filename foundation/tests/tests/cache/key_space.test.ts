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

import "@scribe/foundation/tests/testing/settings.ts";

import { withJitter } from "@scribe/foundation/lib/src/cache/ttl_jitter.ts";
import { KeySpace } from "@scribe/foundation/lib/src/cache/key_space.ts";
import { Duration } from "@scribe/alchemy";
import { assert, assertEquals } from "@std/assert";

const keys = new KeySpace("auth:device");

Deno.test("KeySpace namespaces an id under its prefix", () => {
  assertEquals(keys.keyOf("42"), "auth:device/42");
});

Deno.test("KeySpace derives a distinct lock key", () => {
  assertEquals(keys.lockKeyOf("42"), "lock:auth:device/42");
  assert(keys.lockKeyOf("42") !== keys.keyOf("42"));
});

Deno.test("KeySpace without a pattern matches the whole namespace", () => {
  assertEquals(keys.matching(), "auth:device/*");
});

Deno.test("KeySpace takes a glob, not a prefix", () => {
  assertEquals(keys.matching("u1:*"), "auth:device/u1:*");
  assertEquals(keys.matching("u1"), "auth:device/u1");
});

Deno.test("withJitter never returns less than the ttl", () => {
  const ttl = Duration.seconds(100);

  for (let i = 0; i < 200; i++) {
    assert(withJitter(ttl) >= ttl.inSeconds);
  }
});

Deno.test("withJitter stays within a tenth above the ttl", () => {
  const ttl = Duration.seconds(100);
  const ceiling = ttl.inSeconds + Math.ceil(ttl.inSeconds * 0.1);

  for (let i = 0; i < 200; i++) {
    assert(withJitter(ttl) < ceiling);
  }
});

Deno.test("withJitter leaves a ttl too small to spread untouched", () => {
  assertEquals(withJitter(Duration.seconds(0)), 0);
});

Deno.test("withJitter actually spreads across calls", () => {
  const ttl = Duration.seconds(1000);
  const seen = new Set(Array.from({ length: 100 }, () => withJitter(ttl)));

  assert(seen.size > 1, "jitter produced a single value");
});
