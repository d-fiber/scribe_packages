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

import "../../testing/settings.ts";

import { PostgrestClient } from "@supabase/postgrest-js";
import { DatabaseQueryError, TypedQueryBuilder } from "../../../lib/src/database/query/typed_query_builder.ts";
import { AMBIGUITY_PROBE, atMostOneRow, DEFAULT_STATE } from "../../../lib/src/database/query/query_state.ts";
import { assert, assertEquals, assertRejects } from "@std/assert";

interface Probe {
  readonly builder: TypedQueryBuilder<{ id: string; user_id: string }>;
  readonly sent: string[];
}

function probe(rows: unknown[]): Probe {
  const sent: string[] = [];
  const fakeFetch = ((input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    sent.push(decodeURIComponent(url));
    return Promise.resolve(
      new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;

  const client = new PostgrestClient("http://pg.test", { fetch: fakeFetch });
  return {
    builder: new TypedQueryBuilder(client, "t__unowned_probe"),
    sent,
  };
}

Deno.test("getOne asks the database for two rows, never for the whole match set", async () => {
  const { builder, sent } = probe([{ id: "r0", user_id: "u1" }]);

  await builder.where((f) => f.user_id.eq("u1")).getOne();

  assert(
    sent[0].includes(`limit=${AMBIGUITY_PROBE}`),
    `the query must be bounded, got ${sent[0]}`,
  );
});

Deno.test("getOne keeps the three outcomes it had before the bound", async () => {
  const none = probe([]);
  assertEquals(await none.builder.where((f) => f.user_id.eq("u1")).getOne(), null);

  const one = probe([{ id: "r0", user_id: "u1" }]);
  assertEquals(await one.builder.where((f) => f.user_id.eq("u1")).getOne(), {
    id: "r0",
    user_id: "u1",
  });

  const many = probe([{ id: "r0", user_id: "u1" }, { id: "r1", user_id: "u1" }]);
  await assertRejects(
    () => many.builder.where((f) => f.user_id.eq("u1")).getOne(),
    DatabaseQueryError,
    undefined,
    "an ambiguous match must still be an error, not a silent first row",
  );
});

Deno.test("a caller who set their own bound keeps it", () => {
  assertEquals(
    atMostOneRow({ ...DEFAULT_STATE, limitCount: 10 }).limitCount,
    10,
    "an explicit limit is the caller's decision",
  );
  assertEquals(
    atMostOneRow({ ...DEFAULT_STATE, rangeVal: [0, 4] }).limitCount,
    null,
    "a range already bounds the read, adding a limit would fight it",
  );
});

Deno.test("an unbounded read gets the ambiguity probe and nothing more", () => {
  assertEquals(atMostOneRow(DEFAULT_STATE).limitCount, AMBIGUITY_PROBE);
  assertEquals(atMostOneRow(DEFAULT_STATE).rangeVal, null);
});

Deno.test("get stays unbounded, the probe belongs to getOne alone", async () => {
  const { builder, sent } = probe([
    { id: "r0", user_id: "u1" },
    { id: "r1", user_id: "u1" },
    { id: "r2", user_id: "u1" },
  ]);

  const rows = await builder.where((f) => f.user_id.eq("u1")).get();

  assertEquals(rows.length, 3, "a list read must not be truncated to the probe");
  assert(
    !sent[0].includes("limit="),
    `a list read must carry no limit of its own, got ${sent[0]}`,
  );
});
