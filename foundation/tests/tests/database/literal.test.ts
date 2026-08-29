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
import { allOf, equals, expect, isA, isFalse, isTrue, Scribe, throwsA, withMessage } from "@scribe/alchemy/test";
import "../../testing/settings.ts";

import {
  assertPlainColumn,
  isFilterKeyword,
  keywordLiteral,
  quoteFilterList,
  quoteFilterLiteral,
  UnsafeFilterError,
} from "../../../lib/src/database/query/filter_literal.ts";
const RESERVED = [",", ".", ":", "*", "(", ")"];

Scribe.test("every PostgREST reserved character survives inside the quotes", () => {
  for (const char of RESERVED) {
    const quoted = quoteFilterLiteral(`a${char}b`);

    expect(quoted, equals(`"a${char}b"`));
    expect(quoted.startsWith('"') && quoted.endsWith('"'), isTrue, char);
  }
});

Scribe.test("a value cannot close the quotes and open a new filter term", () => {
  expect(quoteFilterLiteral('paid",user_id.not.is.null,x."'), equals('"paid\\",user_id.not.is.null,x.\\""'));
});

Scribe.test("a backslash cannot escape the closing quote", () => {
  expect(quoteFilterLiteral("a\\"), equals('"a\\\\"'));
  expect(quoteFilterLiteral('a\\"b'), equals('"a\\\\\\"b"'));
});

Scribe.test("a value cannot break out of the group to reach another parameter", () => {
  const hostile = "paid)&select=*,internal_t__app_users(*)&x=(";

  expect(quoteFilterLiteral(hostile), equals(`"${hostile}"`));
});

Scribe.test("numbers and booleans stay bare-typed rather than becoming strings", () => {
  expect(quoteFilterLiteral(42), equals("42"));
  expect(quoteFilterLiteral(-1.5), equals("-1.5"));
  expect(quoteFilterLiteral(NaN), equals('"NaN"'));
  expect(quoteFilterLiteral(Infinity), equals('"Infinity"'));
  expect(quoteFilterLiteral(true), equals("true"));
  expect(quoteFilterLiteral(false), equals("false"));
  expect(quoteFilterLiteral(null), equals("null"));
  expect(quoteFilterLiteral(undefined), equals("null"));
});

Scribe.test("a list keeps each element quoted so one member cannot add another", () => {
  expect(quoteFilterList(["a", "b"]), equals('("a","b")'));
  expect(quoteFilterList(['a","b']), equals('("a\\",\\"b")'));
  expect(quoteFilterList([]), equals("()"));
});

Scribe.test("the is operator keeps the bare keywords it is the only one to accept", () => {
  expect(keywordLiteral(null), equals("null"));
  expect(keywordLiteral(true), equals("true"));
  expect(keywordLiteral("NULL"), equals("null"));

  expect(isFilterKeyword(null), isTrue);
  expect(isFilterKeyword("unknown"), isTrue);
  expect(isFilterKeyword("paid"), isFalse);
});

Scribe.test("a column name that is not a plain identifier is refused, not escaped", () => {
  expect(assertPlainColumn("user_id"), equals("user_id"));
  expect(assertPlainColumn("_x9"), equals("_x9"));

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
    expect(() => assertPlainColumn(hostile), throwsA(isA(UnsafeFilterError)), hostile);
  }
});

Scribe.test("a keyword the is operator does not accept is refused, not spliced in", () => {
  for (const hostile of ["null,id.gt.0", "null,or(role.eq.admin)", "anything at all", 42]) {
    expect(
      () => keywordLiteral(hostile),
      throwsA(allOf(isA(UnsafeFilterError), withMessage("is not one of null, true, false, unknown"))),
    );
  }
});

Scribe.test("the four keywords the is operator accepts still answer, whatever their case", () => {
  expect(keywordLiteral(null), equals("null"));
  expect(keywordLiteral(undefined), equals("null"));
  expect(keywordLiteral(true), equals("true"));
  expect(keywordLiteral("TRUE"), equals("true"));
  expect(keywordLiteral("Unknown"), equals("unknown"));
});

Scribe.test("what keywordLiteral answers can never carry a term separator", () => {
  for (const accepted of [null, true, false, "null", "TRUE", "unknown"]) {
    expect(`archived.is.${keywordLiteral(accepted)}`.split(",").length, equals(1));
  }
});
