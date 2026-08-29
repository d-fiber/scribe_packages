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
import "@scribe/testing/runner.ts";
import { allOf, equals, expect, expectLater, isA, Scribe, throwsA, withMessage } from "@scribe/alchemy/test";
import { installDrivers } from "../../testing/drivers.ts";
import type { RequestUser } from "@scribe/alchemy/route";
import { RequestIdentityCache } from "@scribe/runtime/http/accessors/identity.ts";
import { RequestScope } from "@scribe/runtime/scope.ts";
import { from } from "../../../lib/src/database/tables_base.ts";
import { registerTableOwners } from "../../../lib/src/database/table_owners.ts";
import { READS_EVERY_ROW, UnprovenCallerError } from "../../../lib/src/database/query/owner_scope.ts";
import { clientOf, installDatabaseMock } from "./mocks/install_database.ts";

interface Secret {
  readonly id: string;
  readonly owner_id: string;
  readonly body: string;
}

const SECRETS = "t_owned_secrets";
const OPEN = "t_open_notes";

registerTableOwners({ [SECRETS]: "owner_id" });

const CALLER: RequestUser = {
  id: "u1",
  caller: "authenticated",
  role: "",
  permissions: [],
  claims: { email: "u1@example.com" },
};

const EVERY_ROW: RequestUser = {
  id: "root",
  caller: "authenticated",
  role: "owner",
  permissions: [READS_EVERY_ROW],
  claims: { email: "root@example.com" },
};

const TWO_OWNERS = [
  { id: "s1", owner_id: "u1", body: "mine" },
  { id: "s2", owner_id: "victim", body: "theirs" },
];

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

installDrivers();

Scribe.test("DEFECT insert lets a caller write a row owned by somebody else", async () => {
  const mock = installDatabaseMock({ [SECRETS]: [] });
  try {
    const outcome = await withIdentity(
      CALLER,
      () => from<Secret>(clientOf(mock), SECRETS).insert({ id: "s9", owner_id: "victim", body: "planted" }),
    );

    expect(outcome.ok, equals(false), "naming an owner the caller is not must not be written");
    expect(mock.rows(SECRETS).length, equals(0), "no row may be planted under another owner");
  } finally {
    mock.restore();
  }
});

Scribe.test("DEFECT insertOne lets a caller write a row owned by somebody else", async () => {
  const mock = installDatabaseMock({ [SECRETS]: [] });
  try {
    const outcome = await withIdentity(
      CALLER,
      () => from<Secret>(clientOf(mock), SECRETS).insertOne({ id: "s9", owner_id: "victim", body: "planted" }),
    );

    expect(outcome.ok, equals(false), "the one-row insert has to refuse what the many-row one refuses");
    expect(mock.rows(SECRETS).length, equals(0));
  } finally {
    mock.restore();
  }
});

Scribe.test("DEFECT one row of a batch naming another owner carries the whole batch through", async () => {
  const mock = installDatabaseMock({ [SECRETS]: [] });
  try {
    const outcome = await withIdentity(
      CALLER,
      () =>
        from<Secret>(clientOf(mock), SECRETS).insert([
          { id: "a", body: "mine" },
          { id: "b", owner_id: "victim", body: "planted" },
        ] as never),
    );

    expect(outcome.ok, equals(false), "one row naming another owner refuses the batch it is in");
    expect(
      mock.rows(SECRETS).length,
      equals(0),
      "the row that named nobody must not be written either, or the batch is half applied",
    );
  } finally {
    mock.restore();
  }
});

Scribe.test("DEFECT an anonymous caller writes into a table it may not read a single row of", async () => {
  const mock = installDatabaseMock({ [SECRETS]: [] });
  try {
    const outcome = await withIdentity(
      null,
      () => from<Secret>(clientOf(mock), SECRETS).insert({ id: "s9", owner_id: "victim", body: "planted" }),
    );

    expect(outcome.ok, equals(false), "a caller narrowed to nobody on the read side owns no row to write either");
    expect(mock.rows(SECRETS).length, equals(0));
  } finally {
    mock.restore();
  }
});

Scribe.test("DEFECT update rewrites the owning column and hands the row to somebody else", async () => {
  const mock = installDatabaseMock({ [SECRETS]: [...TWO_OWNERS] });
  try {
    const outcome = await withIdentity(
      CALLER,
      () => from<Secret>(clientOf(mock), SECRETS).update({ owner_id: "victim" } as never),
    );

    expect(outcome.ok, equals(false), "the column the scope is decided on is not the caller's to write");
    expect(
      mock.rows(SECRETS).find((row) => row.id === "s1")?.owner_id,
      equals("u1"),
      "the row stayed with the caller who owned it",
    );
  } finally {
    mock.restore();
  }
});

Scribe.test("insert fills the owning column of every row of a batch that leaves it out", async () => {
  const mock = installDatabaseMock({ [SECRETS]: [] });
  try {
    const outcome = await withIdentity(
      CALLER,
      () =>
        from<Secret>(clientOf(mock), SECRETS).insert([
          { id: "a", body: "one" },
          { id: "b", body: "two" },
        ] as never),
    );

    expect(outcome.ok, equals(true));
    expect(mock.rows(SECRETS).map((row) => row.owner_id), equals(["u1", "u1"]));
  } finally {
    mock.restore();
  }
});

Scribe.test("insert into an owned table from a path that proved no caller is refused, not filled with nothing", async () => {
  const mock = installDatabaseMock({ [SECRETS]: [] });
  try {
    await expectLater(
      () => from<Secret>(clientOf(mock), SECRETS).insert({ id: "s9", body: "x" } as never),
      throwsA(allOf(isA(UnprovenCallerError), withMessage("with no caller"))),
    );
    expect(mock.rows(SECRETS).length, equals(0));
  } finally {
    mock.restore();
  }
});

Scribe.test("entireTable does not lift the owner scope, it only lifts the refusal", async () => {
  const mock = installDatabaseMock({ [SECRETS]: [...TWO_OWNERS] });
  try {
    const outcome = await withIdentity(
      CALLER,
      () => from<Secret>(clientOf(mock), SECRETS).entireTable().delete(),
    );

    expect(outcome.ok, equals(true));
    expect(
      mock.rows(SECRETS).map((row) => row.id),
      equals(["s2"]),
      "declaring the write deliberate reaches every row the caller owns, and no other",
    );
  } finally {
    mock.restore();
  }
});

Scribe.test("the permission to read every row is also what reaches every row of a write", async () => {
  const mock = installDatabaseMock({ [SECRETS]: [...TWO_OWNERS] });
  try {
    const outcome = await withIdentity(
      EVERY_ROW,
      () => from<Secret>(clientOf(mock), SECRETS).entireTable().delete(),
    );

    expect(outcome.ok, equals(true));
    expect(mock.rows(SECRETS).length, equals(0));
  } finally {
    mock.restore();
  }
});

Scribe.test("a scoped delete naming another owner in its predicate removes nothing", async () => {
  const mock = installDatabaseMock({ [SECRETS]: [...TWO_OWNERS] });
  try {
    const outcome = await withIdentity(
      CALLER,
      () => from<Secret>(clientOf(mock), SECRETS).where((f) => f.owner_id.eq("victim")).delete(),
    );

    expect(outcome.ok, equals(true));
    expect(outcome.ok === true && outcome.data, equals(0), "the two owner conditions can never both hold");
    expect(mock.rows(SECRETS).length, equals(2));
  } finally {
    mock.restore();
  }
});

Scribe.test("a table nobody owns is written without an owning column being invented for it", async () => {
  const mock = installDatabaseMock({ [OPEN]: [] });
  try {
    const outcome = await withIdentity(
      CALLER,
      () => from<{ id: string }>(clientOf(mock), OPEN).insert({ id: "n1" }),
    );

    expect(outcome.ok, equals(true));
    expect(mock.rows(OPEN), equals([{ id: "n1" }]), "no column was added to a table that declares no owner");
  } finally {
    mock.restore();
  }
});

Scribe.test("unscoped on a write is what a worker uses, and it reaches rows the caller does not own", async () => {
  const mock = installDatabaseMock({ [SECRETS]: [...TWO_OWNERS] });
  try {
    const outcome = await from<Secret>(clientOf(mock), SECRETS)
      .unscoped()
      .where((f) => f.id.eq("s2"))
      .delete();

    expect(outcome.ok, equals(true));
    expect(mock.rows(SECRETS).map((row) => row.id), equals(["s1"]));
  } finally {
    mock.restore();
  }
});
