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
import { equals, expect, isA, isNot, isTrue, Scribe, throwsA } from "@scribe/alchemy/test";
import { installDrivers } from "../../testing/drivers.ts";
import "../../testing/settings.ts";

import { PostgrestClient } from "@supabase/postgrest-js";
import { TypedQueryBuilder } from "../../../lib/src/database/query/typed_query_builder.ts";
import {
  quoteFilterList,
  quoteFilterLiteral,
  UnsafeFilterError,
} from "../../../lib/src/database/query/filter_literal.ts";
// deno-lint-ignore no-explicit-any
type AnyFilter = any;

interface Wire {
  readonly builder: TypedQueryBuilder<Record<string, unknown>>;
  readonly sent: string[];
}

installDrivers();

const TABLE = "t__unowned_wire";
const NUL = "\u0000";

function wire(): Wire {
  const sent: string[] = [];
  const fakeFetch = ((input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    sent.push(url);
    return Promise.resolve(
      new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
    );
  }) as typeof fetch;

  return {
    builder: new TypedQueryBuilder(new PostgrestClient("http://pg.test", { fetch: fakeFetch }), TABLE),
    sent,
  };
}

async function queryString(build: (b: TypedQueryBuilder<Record<string, unknown>>) => unknown): Promise<string> {
  const { builder, sent } = wire();
  await (build(builder) as { get(): Promise<unknown> }).get();
  return sent[0].slice("http://pg.test/".length + TABLE.length + 1);
}

function term(query: string, parameter: string): string {
  const found = query.split("&").find((part) => part.startsWith(`${parameter}=`));
  return found === undefined ? "" : found.slice(parameter.length + 1);
}

const RESERVED: Record<string, string> = {
  comma: ",",
  ampersand: "&",
  equals: "=",
  openParen: "(",
  closeParen: ")",
  doubleQuote: '"',
  backslash: "\\",
  percent: "%",
  hash: "#",
};

Scribe.test("every character PostgREST reads as syntax leaves a value percent-encoded", async () => {
  for (const [name, char] of Object.entries(RESERVED)) {
    const value = `a${char}b`;
    const query = await queryString((b) => b.where((f: AnyFilter) => f.status.eq(value)));

    expect(query.split("&").length, equals(2), `${name} opened a second parameter: ${query}`);
    expect(
      decodeURIComponent(term(query, "status")),
      equals(`eq.${quoteFilterLiteral(value)}`),
      `${name} did not survive the encoding of ${query}`,
    );
    expect(
      term(query, "status").slice("eq.".length).includes(char),
      equals(char === "%"),
      `${name} reached the wire unencoded in ${query}`,
    );
  }
});

Scribe.test("a value cannot close a filter and open another parameter", async () => {
  const query = await queryString((b) => b.where((f: AnyFilter) => f.status.eq("paid&select=*,t__secrets(*)&limit=1")));

  expect(query.split("&").length, equals(2), `the value stayed one term: ${query}`);
  expect(query.startsWith("select=*&status=eq."), isTrue, query);
});

Scribe.test("a column name that carries syntax is refused, so it names a column and nothing else", () => {
  for (const hostile of ["status&select=*", "status.eq.paid,id", "or(role.eq.admin)", "data->>secret"]) {
    expect(
      () => wire().builder.where((f: AnyFilter) => f[hostile].eq("x")),
      throwsA(isA(UnsafeFilterError)),
      `the column ${JSON.stringify(hostile)} was taken as a column name`,
    );
  }
});

Scribe.test("a null byte in a value does not truncate the query", async () => {
  const query = await queryString((b) => b.where((f: AnyFilter) => f.status.eq(`a${NUL}&limit=1`)));

  expect(query.split("&").length, equals(2), query);
  expect(term(query, "status").includes("%00"), isTrue, query);
});

Scribe.test("an unpaired surrogate is replaced rather than raising on the way out", async () => {
  const query = await queryString((b) => b.where((f: AnyFilter) => f.status.eq("a\uD800b")));

  expect(
    decodeURIComponent(term(query, "status")),
    equals(`eq.${quoteFilterLiteral("a\uFFFDb")}`),
    "a lone surrogate becomes the replacement character",
  );
});

Scribe.test("an owner whose identifier carries syntax still narrows to one owner", async () => {
  const hostile = 'u1",id.gt.0,x."';
  const query = await queryString((b) => b.where((f: AnyFilter) => f.owner_id.eq(hostile)));

  expect(query.split("&").length, equals(2), `an identifier out of a token cannot add a term: ${query}`);
  expect(decodeURIComponent(term(query, "owner_id")), equals(`eq.${quoteFilterLiteral(hostile)}`));
});

Scribe.test("DEFECT the text null and an absent value are the same query on the wire", async () => {
  const asText = await queryString((b) => b.where((f: AnyFilter) => f.status.eq("null")));
  const asNothing = await queryString((b) => b.where((f: AnyFilter) => f.status.is(null)));

  expect(
    term(asText, "status").replace("eq.", ""),
    isNot(equals(term(asNothing, "status").replace("is.", ""))),
    "a column holding the text null must not be asked for the way an empty column is",
  );
  expect(decodeURIComponent(term(asText, "status")), equals(`eq.${quoteFilterLiteral("null")}`));
});

Scribe.test("DEFECT an in list holding the text null asks for the rows holding nothing", async () => {
  const asText = await queryString((b) => b.where((f: AnyFilter) => f.status.in(["null"])));
  const asNothing = await queryString((b) => b.where((f: AnyFilter) => f.status.in([null] as never)));

  expect(term(asText, "status"), isNot(equals(term(asNothing, "status"))));
  expect(decodeURIComponent(term(asText, "status")), equals(`in.${quoteFilterList(["null"])}`));
});

Scribe.test("DEFECT a quote inside an in list member is neither escaped nor quoted", async () => {
  const query = await queryString((b) => b.where((f: AnyFilter) => f.status.in(['a"', "b,c"])));

  expect(
    decodeURIComponent(term(query, "status")),
    equals(`in.${quoteFilterList(['a"', "b,c"])}`),
    "one member's quote must not run into the next member",
  );
});

Scribe.test("DEFECT a nested array in an in list flattens into two members", async () => {
  const nested = await queryString((b) => b.where((f: AnyFilter) => f.status.in([["a", "b"]] as never)));
  const flat = await queryString((b) => b.where((f: AnyFilter) => f.status.in(["a", "b"])));

  expect(
    term(nested, "status"),
    isNot(equals(term(flat, "status"))),
    "a list of one member must not become one of two",
  );
});

Scribe.test("DEFECT the is operator takes what keywordLiteral was written to refuse", () => {
  for (const hostile of ["not a keyword", "null,id.gt.0", 42]) {
    expect(
      () => wire().builder.where((f: AnyFilter) => f.status.is(hostile as never)),
      throwsA(isA(UnsafeFilterError)),
      `is() accepted ${JSON.stringify(hostile)} instead of refusing it`,
    );
  }
});

Scribe.test("DEFECT a bound that is not a whole number reaches the wire as it was written", async () => {
  for (const bound of [NaN, Infinity, -1, 1.5]) {
    const query = await queryString((b) => b.limit(bound));

    expect(term(query, "limit"), equals(""), `limit(${bound}) reached the wire: ${query}`);
  }
});

Scribe.test("a range asks for an offset and a bound of its own", async () => {
  expect(term(await queryString((b) => b.range(0, 9)), "limit"), equals("10"));
  expect(term(await queryString((b) => b.range(0, 9)), "offset"), equals("0"));
  expect(term(await queryString((b) => b.range(5, 5)), "limit"), equals("1"));
});

Scribe.test("a pattern keeps the wildcards a caller wrote and adds none of its own", async () => {
  const query = await queryString((b) => b.where((f: AnyFilter) => f.status.like("%a_b%")));

  expect(decodeURIComponent(term(query, "status")), equals(`like.${quoteFilterLiteral("%a_b%")}`));
  expect(query.split("&").length, equals(2), query);
});
