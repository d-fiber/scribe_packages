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

import { installDrivers } from "@scribe/foundation/tests/testing/drivers.ts";
import { assertEquals, assertRejects } from "@std/assert";
import type { RequestUser } from "@scribe/alchemy/route";
import { RequestIdentityCache } from "@scribe/runtime/http/accessors/identity.ts";
import { RequestScope } from "@scribe/runtime/scope.ts";
import { from } from "@scribe/foundation/lib/src/database/tables_base.ts";
import { registerTableOwners } from "@scribe/foundation/lib/src/database/table_owners.ts";
import { READS_EVERY_ROW, UnprovenCallerError } from "@scribe/foundation/lib/src/database/query/owner_scope.ts";
import { clientOf, installDatabaseMock } from "@scribe/foundation/tests/tests/database/mocks/install_database.ts";

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

Deno.test({
  name: "DEFECT insert lets a caller write a row owned by somebody else",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mock = installDatabaseMock({ [SECRETS]: [] });
    try {
      const outcome = await withIdentity(
        CALLER,
        () => from<Secret>(clientOf(mock), SECRETS).insert({ id: "s9", owner_id: "victim", body: "planted" }),
      );

      assertEquals(outcome.ok, false, "naming an owner the caller is not must not be written");
      assertEquals(mock.rows(SECRETS).length, 0, "no row may be planted under another owner");
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "DEFECT insertOne lets a caller write a row owned by somebody else",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mock = installDatabaseMock({ [SECRETS]: [] });
    try {
      const outcome = await withIdentity(
        CALLER,
        () => from<Secret>(clientOf(mock), SECRETS).insertOne({ id: "s9", owner_id: "victim", body: "planted" }),
      );

      assertEquals(outcome.ok, false, "the one-row insert has to refuse what the many-row one refuses");
      assertEquals(mock.rows(SECRETS).length, 0);
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "DEFECT one row of a batch naming another owner carries the whole batch through",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
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

      assertEquals(outcome.ok, false, "one row naming another owner refuses the batch it is in");
      assertEquals(
        mock.rows(SECRETS).length,
        0,
        "the row that named nobody must not be written either, or the batch is half applied",
      );
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "DEFECT an anonymous caller writes into a table it may not read a single row of",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mock = installDatabaseMock({ [SECRETS]: [] });
    try {
      const outcome = await withIdentity(
        null,
        () => from<Secret>(clientOf(mock), SECRETS).insert({ id: "s9", owner_id: "victim", body: "planted" }),
      );

      assertEquals(outcome.ok, false, "a caller narrowed to nobody on the read side owns no row to write either");
      assertEquals(mock.rows(SECRETS).length, 0);
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "DEFECT update rewrites the owning column and hands the row to somebody else",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mock = installDatabaseMock({ [SECRETS]: [...TWO_OWNERS] });
    try {
      const outcome = await withIdentity(
        CALLER,
        () => from<Secret>(clientOf(mock), SECRETS).update({ owner_id: "victim" } as never),
      );

      assertEquals(outcome.ok, false, "the column the scope is decided on is not the caller's to write");
      assertEquals(
        mock.rows(SECRETS).find((row) => row.id === "s1")?.owner_id,
        "u1",
        "the row stayed with the caller who owned it",
      );
    } finally {
      mock.restore();
    }
  },
});

Deno.test("insert fills the owning column of every row of a batch that leaves it out", async () => {
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

    assertEquals(outcome.ok, true);
    assertEquals(mock.rows(SECRETS).map((row) => row.owner_id), ["u1", "u1"]);
  } finally {
    mock.restore();
  }
});

Deno.test("insert into an owned table from a path that proved no caller is refused, not filled with nothing", async () => {
  const mock = installDatabaseMock({ [SECRETS]: [] });
  try {
    await assertRejects(
      () => from<Secret>(clientOf(mock), SECRETS).insert({ id: "s9", body: "x" } as never),
      UnprovenCallerError,
      "with no caller",
    );
    assertEquals(mock.rows(SECRETS).length, 0);
  } finally {
    mock.restore();
  }
});

Deno.test({
  name: "entireTable does not lift the owner scope, it only lifts the refusal",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mock = installDatabaseMock({ [SECRETS]: [...TWO_OWNERS] });
    try {
      const outcome = await withIdentity(
        CALLER,
        () => from<Secret>(clientOf(mock), SECRETS).entireTable().delete(),
      );

      assertEquals(outcome.ok, true);
      assertEquals(
        mock.rows(SECRETS).map((row) => row.id),
        ["s2"],
        "declaring the write deliberate reaches every row the caller owns, and no other",
      );
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "the permission to read every row is also what reaches every row of a write",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mock = installDatabaseMock({ [SECRETS]: [...TWO_OWNERS] });
    try {
      const outcome = await withIdentity(
        EVERY_ROW,
        () => from<Secret>(clientOf(mock), SECRETS).entireTable().delete(),
      );

      assertEquals(outcome.ok, true);
      assertEquals(mock.rows(SECRETS).length, 0);
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "a scoped delete naming another owner in its predicate removes nothing",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mock = installDatabaseMock({ [SECRETS]: [...TWO_OWNERS] });
    try {
      const outcome = await withIdentity(
        CALLER,
        () => from<Secret>(clientOf(mock), SECRETS).where((f) => f.owner_id.eq("victim")).delete(),
      );

      assertEquals(outcome.ok, true);
      assertEquals(outcome.ok === true && outcome.data, 0, "the two owner conditions can never both hold");
      assertEquals(mock.rows(SECRETS).length, 2);
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "a table nobody owns is written without an owning column being invented for it",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mock = installDatabaseMock({ [OPEN]: [] });
    try {
      const outcome = await withIdentity(
        CALLER,
        () => from<{ id: string }>(clientOf(mock), OPEN).insert({ id: "n1" }),
      );

      assertEquals(outcome.ok, true);
      assertEquals(mock.rows(OPEN), [{ id: "n1" }], "no column was added to a table that declares no owner");
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "unscoped on a write is what a worker uses, and it reaches rows the caller does not own",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mock = installDatabaseMock({ [SECRETS]: [...TWO_OWNERS] });
    try {
      const outcome = await from<Secret>(clientOf(mock), SECRETS)
        .unscoped()
        .where((f) => f.id.eq("s2"))
        .delete();

      assertEquals(outcome.ok, true);
      assertEquals(mock.rows(SECRETS).map((row) => row.id), ["s1"]);
    } finally {
      mock.restore();
    }
  },
});
