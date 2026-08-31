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
import { equals, expect, isNot, Scribe } from "@scribe/alchemy/test";
import { digest, roundCoord, stableKey, timeBucket } from "@scribe/search";

Scribe.test("two objects meaning the same thing write the same key whatever their field order", () => {
  expect(stableKey({ a: 1, b: 2 }), equals(stableKey({ b: 2, a: 1 })));
});

Scribe.test("the key is sorted at every depth, not only at the top", () => {
  expect(stableKey({ outer: { a: 1, b: 2 } }), equals(stableKey({ outer: { b: 2, a: 1 } })));
});

Scribe.test("a list of scalars means the same whichever order a caller passed it in", () => {
  expect(stableKey({ status: ["open", "closed"] }), equals(stableKey({ status: ["closed", "open"] })));
});

Scribe.test("a list of objects keeps its order, since there the order is the meaning", () => {
  expect(stableKey([{ rank: "desc" }, { name: "asc" }]), isNot(equals(stableKey([{ name: "asc" }, { rank: "desc" }]))));
});

Scribe.test("two values that differ get different keys", () => {
  expect(stableKey({ text: "rosa" }), isNot(equals(stableKey({ text: "lino" }))));
});

Scribe.test("a digest is eight hexadecimal characters, and follows what the value means", () => {
  expect(digest({ a: 1 }).length, equals(8));
  expect(digest({ a: 1, b: 2 }), equals(digest({ b: 2, a: 1 })));
  expect(digest({ a: 1 }), isNot(equals(digest({ a: 2 }))));
});

Scribe.test("every moment inside one bucket rounds down to the same start", () => {
  expect(timeBucket(1_000, 60_000), equals(0));
  expect(timeBucket(59_999, 60_000), equals(0));
  expect(timeBucket(60_000, 60_000), equals(60_000));
  expect(timeBucket(119_999, 60_000), equals(60_000));
});

Scribe.test("two nearby callers round onto one coordinate, and distant ones do not", () => {
  expect(roundCoord(48.8564, 2), equals(roundCoord(48.8576, 2)));
  expect(roundCoord(48.8564, 3), isNot(equals(roundCoord(48.8576, 3))));
});
