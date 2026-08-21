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

import { assertEquals } from "@std/assert";
import type { SearchParams } from "@scribe/search/contracts/definition.ts";
import { MultiMatchType, SortOrder } from "@scribe/search/contracts/query.ts";
import { Field, QueryBuilder, Search } from "@scribe/search/mod.ts";

interface StoreRow {
  store_id: string;
  name: string;
  status: string;
  rank: number;
}

interface StoreSearch extends SearchParams {
  text?: string;
  status?: string;
  sort?: "name" | "rank";
}

const stores = Search.on<StoreRow>("query_stores", "store_id")
  .document((s) => ({
    name: Field.text(s.name, { boost: 3, sortable: true }),
    status: Field.keyword(s.status),
    rank: Field.integer(s.rank),
  }))
  .preview((s) => ({ id: s.store_id, name: s.name }))
  .sorts((f) => ({
    name: f.keyword("name", SortOrder.Asc),
    rank: f.sort("rank", SortOrder.Desc),
  }))
  .query((params: StoreSearch, { q, f, sorts }) =>
    q.text(params.text)
      .filter(params.status !== undefined && { term: { [f.field("status")]: params.status } })
      .sort(params.sort === "rank" ? sorts.rank : sorts.name)
  );

Deno.test("a query with no parameter keeps every document and sorts by its first named sort", () => {
  assertEquals(stores.plan({}), {
    bool: { must: { match_all: {} } },
    sort: [{ "name.keyword": SortOrder.Asc }],
  });
});

Deno.test("a text query looks in the declared text fields, each carrying its own weight", () => {
  const clause = stores.plan({ text: "rosa" }).bool.must as {
    bool: { should: { multi_match: { fields: string[]; type?: MultiMatchType } }[] };
  };

  assertEquals(clause.bool.should[0].multi_match.fields, ["name^3"]);
  assertEquals(clause.bool.should[0].multi_match.type, MultiMatchType.PhrasePrefix);
  assertEquals(clause.bool.should[1].multi_match.fields, ["name^3"]);
});

Deno.test("a filter the caller left out is not written into the plan", () => {
  assertEquals(stores.plan({}).bool.filter, undefined);
  assertEquals(stores.plan({ status: "open" }).bool.filter, [{ term: { status: "open" } }]);
});

Deno.test("the sort a caller names is the one the plan carries", () => {
  assertEquals(stores.plan({ sort: "rank" }).sort, [{ rank: SortOrder.Desc }]);
  assertEquals(stores.plan({ sort: "name" }).sort, [{ "name.keyword": SortOrder.Asc }]);
});

Deno.test("a builder given no text at all keeps every document", () => {
  assertEquals(new QueryBuilder(["name"]).text(undefined).build().bool.must, { match_all: {} });
});

Deno.test("a builder given text but no field to look in keeps every document", () => {
  assertEquals(new QueryBuilder([]).text("rosa").build().bool.must, { match_all: {} });
});

Deno.test("a builder drops every clause whose value the caller left out", () => {
  const plan = new QueryBuilder(["name"])
    .filter(undefined)
    .mustNot(false)
    .should(null)
    .build();

  assertEquals(plan, { bool: { must: { match_all: {} } }, sort: [] });
});

Deno.test("a builder keeps the clauses it was given, each in its own list", () => {
  const plan = new QueryBuilder(["name"])
    .filter({ term: { status: "open" } })
    .mustNot({ term: { status: "closed" } })
    .should({ term: { rank: 1 } })
    .minimumShouldMatch(1)
    .build();

  assertEquals(plan.bool.filter, [{ term: { status: "open" } }]);
  assertEquals(plan.bool.must_not, [{ term: { status: "closed" } }]);
  assertEquals(plan.bool.should, [{ term: { rank: 1 } }]);
  assertEquals(plan.bool.minimum_should_match, 1);
});

Deno.test("a sort given as a list keeps the order its clauses break ties in", () => {
  const plan = new QueryBuilder([]).sort([{ rank: SortOrder.Desc }, "_score"]).build();

  assertEquals(plan.sort, [{ rank: SortOrder.Desc }, "_score"]);
});
