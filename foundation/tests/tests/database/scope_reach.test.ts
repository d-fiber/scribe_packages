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
import { allOf, equals, expect, expectLater, isA, isTrue, Scribe, throwsA, withMessage } from "@scribe/alchemy/test";
import { installDrivers } from "../../testing/drivers.ts";
import type { RequestUser } from "@scribe/alchemy/route";
import { RequestIdentityCache } from "@scribe/runtime/http/accessors/identity.ts";
import { RequestScope } from "@scribe/runtime/scope.ts";
import { PostgrestClient } from "@supabase/postgrest-js";
import { TypedQueryBuilder } from "../../../lib/src/database/query/typed_query_builder.ts";
import { registerTableOwners } from "../../../lib/src/database/table_owners.ts";
import { UnprovenCallerError } from "../../../lib/src/database/query/owner_scope.ts";
import { PostgrestDatabases } from "../../../lib/src/database/postgrest_databases.ts";
import { installDatabaseFake } from "../trigger/mocks/database.ts";
import { clientOf, installDatabaseMock } from "./mocks/install_database.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

const ORDERS = "t_reach_orders";
const CARDS = "t_reach_cards";
const OPEN = "t_reach_public";

registerTableOwners({ [ORDERS]: "buyer_id", [CARDS]: "holder_id" });

const CALLER: RequestUser = {
  id: "u1",
  caller: "authenticated",
  role: "",
  permissions: [],
  claims: { email: "u1@example.com" },
};

function withIdentity<T>(identity: RequestUser | null, run: () => Promise<T>): Promise<T> {
  return RequestScope.run(
    new Request("http://test.local/"),
    new Uint8Array(0),
    async () => {
      await RequestIdentityCache.remember(() => Promise.resolve(identity));
      return await run();
    },
    "127.0.0.1",
  );
}

interface Probe {
  readonly builder: TypedQueryBuilder<Any, Any, Any>;
  readonly sent: string[];
}

function probe(table: string): Probe {
  const sent: string[] = [];
  const fakeFetch = ((input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    sent.push(decodeURIComponent(url).slice("http://pg.test/".length));
    return Promise.resolve(
      new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
    );
  }) as typeof fetch;

  return {
    builder: new TypedQueryBuilder(new PostgrestClient("http://pg.test", { fetch: fakeFetch }), table),
    sent,
  };
}

installDrivers();

Scribe.test("DEFECT an embedded table that declares an owner is joined in without an owner filter", async () => {
  const { builder, sent } = probe(ORDERS);

  await withIdentity(CALLER, () =>
    builder
      .select((s: Any) => ({ id: s.id, card: s.embed(CARDS, (c: Any) => ({ pan: c.pan })) }))
      .get());

  expect(sent[0].includes("buyer_id=eq.u1"), isTrue, `the outer table is narrowed: ${sent[0]}`);
  expect(sent[0].includes(`${CARDS}.holder_id=eq.u1`), isTrue, `the embedded table is read whole: ${sent[0]}`);
});

Scribe.test("DEFECT a raw selection embedding an owned table is not narrowed either", async () => {
  const { builder, sent } = probe(ORDERS);

  await withIdentity(CALLER, () => builder.selectRaw(`*,${CARDS}(*)`).get());

  expect(
    sent[0].includes(`${CARDS}.holder_id=eq.u1`),
    isTrue,
    `an embed written by hand reaches rows the caller owns none of: ${sent[0]}`,
  );
});

Scribe.test("the owner filter is added to the table the query names, whatever it selects", async () => {
  const { builder, sent } = probe(ORDERS);

  await withIdentity(CALLER, () =>
    builder
      .select((s: Any) => ({ id: s.id, card: s.embed(CARDS, (c: Any) => ({ pan: c.pan })) }))
      .get());

  expect(sent[0], equals(`${ORDERS}?select=id,${CARDS}(pan)&${CARDS}.holder_id=eq.u1&buyer_id=eq.u1`));
});

Scribe.test("an embed is written as PostgREST spells it, and inner is the caller's own word", async () => {
  const { builder, sent } = probe(ORDERS);

  await withIdentity(CALLER, () =>
    builder
      .select((s: Any) => ({ card: s.embed(CARDS, (c: Any) => ({ pan: c.pan }), { inner: true }) }))
      .get());

  expect(sent[0], equals(`${ORDERS}?select=${CARDS}!inner(pan)&buyer_id=eq.u1`));
});

Scribe.test("a Postgres function is reached from a path that proved no caller, unlike a table", async () => {
  const mock = installDatabaseMock();
  mock.onRpc("t_reach_count", () => 3);
  try {
    const answered = await mock.service.rpc<{ n: number }>("t_reach_count");

    expect(answered.data, equals(3), "nothing on the rpc path reads who is calling, so nothing refuses it");

    await expectLater(
      () => new TypedQueryBuilder<{ id: string }>(clientOf(mock), ORDERS).get(),
      throwsA(allOf(isA(UnprovenCallerError), withMessage("with no caller"))),
      "the same path is refused the moment it names an owned table",
    );
  } finally {
    mock.restore();
  }
});

Scribe.test("the port hands back the builder this package reads its own rows with", async () => {
  const db = installDatabaseFake({ [ORDERS]: [] });
  try {
    const table = new PostgrestDatabases().table<{ [ORDERS]: { row: { id: string } } }, typeof ORDERS>(ORDERS);

    await expectLater(
      () => (table as unknown as { get(): Promise<unknown> }).get(),
      throwsA(allOf(isA(UnprovenCallerError), withMessage("with no caller"))),
      "a package reaching the port is held to the same guard as one reaching the builder",
    );
  } finally {
    db.restore();
  }
});

Scribe.test("the port narrows to the caller the same way the builder does", async () => {
  const mock = installDatabaseMock({
    [ORDERS]: [{ id: "o1", buyer_id: "u1" }, { id: "o2", buyer_id: "u2" }],
  });
  const db = installDatabaseFake();
  try {
    const rows = await withIdentity(
      CALLER,
      () => new TypedQueryBuilder<{ id: string; buyer_id: string }>(clientOf(mock), ORDERS).get(),
    );

    expect(rows.map((row) => row.id), equals(["o1"]));
  } finally {
    db.restore();
    mock.restore();
  }
});

Scribe.test("a table nobody registered is read whole, which is why a view over an owned table has to be registered too", async () => {
  const { builder, sent } = probe(OPEN);

  await withIdentity(CALLER, () => builder.get());

  expect(sent[0], equals(`${OPEN}?select=*`), "the engine narrows what a project told it to narrow, and nothing else");
});

Scribe.test("an ordering on an embedded table names the relation rather than widening the query", async () => {
  const { builder, sent } = probe(ORDERS);

  await withIdentity(CALLER, () =>
    builder
      .selectRaw(`*,${CARDS}(*)`)
      .order("pan" as never, { foreignTable: CARDS })
      .get());

  expect(
    sent[0],
    equals(`${ORDERS}?select=*,${CARDS}(*)&${CARDS}.holder_id=eq.u1&buyer_id=eq.u1&${CARDS}.order=pan.asc`),
  );
});
