// Copyright (C) 2026 Fiber
//
// This file is part of scribe and is made available under the PolyForm Shield
// License 1.0.0. The full terms are in the LICENSE file at the root of this
// repository, and at https://polyformproject.org/licenses/shield/1.0.0
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
//
// The one thing you may not do:
// - Use it to provide any product that competes with scribe, or with any
//   product Fiber or its affiliates provide using scribe. Products compete
//   even when they are offered free of charge, through a different kind of
//   interface, or for a different technical platform.
//
// If you pass this software on:
// - Anyone who receives any part of it from you must also receive these terms,
//   or the URL above, together with the "Required Notice" line carried by the
//   LICENSE file.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE COMES AS IS, WITHOUT ANY WARRANTY OR
// CONDITION, AND THE LICENSOR WILL NOT BE LIABLE TO YOU FOR ANY DAMAGES ARISING
// OUT OF THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY KIND OF
// LEGAL CLAIM.
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
} from "@scribe/foundation/src/database/query/literal.ts";
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
