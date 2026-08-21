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

import {
  assertPlainColumn,
  isFilterKeyword,
  keywordLiteral,
  quoteFilterList,
  quoteFilterLiteral,
  UnsafeFilterError,
} from "@scribe/foundation/lib/src/database/query/literal.ts";
import { assert, assertEquals, assertThrows } from "@std/assert";

const RESERVED = [",", ".", ":", "*", "(", ")"];

Deno.test("every PostgREST reserved character survives inside the quotes", () => {
  for (const char of RESERVED) {
    const quoted = quoteFilterLiteral(`a${char}b`);

    assertEquals(quoted, `"a${char}b"`);
    assert(quoted.startsWith('"') && quoted.endsWith('"'), char);
  }
});

Deno.test("a value cannot close the quotes and open a new filter term", () => {
  assertEquals(
    quoteFilterLiteral('paid",user_id.not.is.null,x."'),
    '"paid\\",user_id.not.is.null,x.\\""',
  );
});

Deno.test("a backslash cannot escape the closing quote", () => {
  assertEquals(quoteFilterLiteral("a\\"), '"a\\\\"');
  assertEquals(quoteFilterLiteral('a\\"b'), '"a\\\\\\"b"');
});

Deno.test("a value cannot break out of the group to reach another parameter", () => {
  const hostile = "paid)&select=*,internal_t__app_users(*)&x=(";

  assertEquals(quoteFilterLiteral(hostile), `"${hostile}"`);
});

Deno.test("numbers and booleans stay bare-typed rather than becoming strings", () => {
  assertEquals(quoteFilterLiteral(42), '"42"');
  assertEquals(quoteFilterLiteral(true), "true");
  assertEquals(quoteFilterLiteral(false), "false");
  assertEquals(quoteFilterLiteral(null), "null");
  assertEquals(quoteFilterLiteral(undefined), "null");
});

Deno.test("a list keeps each element quoted so one member cannot add another", () => {
  assertEquals(quoteFilterList(["a", "b"]), '("a","b")');
  assertEquals(quoteFilterList(['a","b']), '("a\\",\\"b")');
  assertEquals(quoteFilterList([]), "()");
});

Deno.test("the is operator keeps the bare keywords it is the only one to accept", () => {
  assertEquals(keywordLiteral(null), "null");
  assertEquals(keywordLiteral(true), "true");
  assertEquals(keywordLiteral("NULL"), "null");

  assert(isFilterKeyword(null));
  assert(isFilterKeyword("unknown"));
  assert(!isFilterKeyword("paid"));
});

Deno.test("a column name that is not a plain identifier is refused, not escaped", () => {
  assertEquals(assertPlainColumn("user_id"), "user_id");
  assertEquals(assertPlainColumn("_x9"), "_x9");

  for (
    const hostile of [
      "status&leak=eq.1",
      "status.eq.a,other",
      "data->>secret",
      "",
      "9lives",
      "user id",
    ]
  ) {
    assertThrows(
      () => assertPlainColumn(hostile),
      UnsafeFilterError,
      undefined,
      hostile,
    );
  }
});
