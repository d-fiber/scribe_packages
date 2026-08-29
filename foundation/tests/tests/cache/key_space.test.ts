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
import "@scribe/testing/runner.ts";
import { equals, expect, isTrue, Scribe } from "@scribe/alchemy/test";
import "../../testing/settings.ts";

import { withJitter } from "../../../lib/src/cache/ttl_jitter.ts";
import { KeySpace } from "../../../lib/src/cache/key_space.ts";
import { Duration } from "@scribe/alchemy";
const keys = new KeySpace("auth:device");

Scribe.test("KeySpace namespaces an id under its prefix", () => {
  expect(keys.keyOf("42"), equals("auth:device/42"));
});

Scribe.test("KeySpace derives a distinct lock key", () => {
  expect(keys.lockKeyOf("42"), equals("lock:auth:device/42"));
  expect(keys.lockKeyOf("42") !== keys.keyOf("42"), isTrue);
});

Scribe.test("KeySpace without a pattern matches the whole namespace", () => {
  expect(keys.matching(), equals("auth:device/*"));
});

Scribe.test("KeySpace takes a glob, not a prefix", () => {
  expect(keys.matching("u1:*"), equals("auth:device/u1:*"));
  expect(keys.matching("u1"), equals("auth:device/u1"));
});

Scribe.test("withJitter never returns less than the ttl", () => {
  const ttl = Duration.seconds(100);

  for (let i = 0; i < 200; i++) {
    expect(withJitter(ttl) >= ttl.inSeconds, isTrue);
  }
});

Scribe.test("withJitter stays within a tenth above the ttl", () => {
  const ttl = Duration.seconds(100);
  const ceiling = ttl.inSeconds + Math.ceil(ttl.inSeconds * 0.1);

  for (let i = 0; i < 200; i++) {
    expect(withJitter(ttl) < ceiling, isTrue);
  }
});

Scribe.test("withJitter leaves a ttl too small to spread untouched", () => {
  expect(withJitter(Duration.seconds(0)), equals(0));
});

Scribe.test("withJitter actually spreads across calls", () => {
  const ttl = Duration.seconds(1000);
  const seen = new Set(Array.from({ length: 100 }, () => withJitter(ttl)));

  expect(seen.size > 1, isTrue, "jitter produced a single value");
});
