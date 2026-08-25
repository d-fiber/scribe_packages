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

import { installDrivers } from "@scribe/foundation/tests/testing/drivers.ts";
import { assertEquals, assertRejects } from "@std/assert";
import type { RequestUser } from "@scribe/alchemy/route";
import { RequestIdentityCache } from "@scribe/runtime/http/accessors/identity.ts";
import { RequestScope } from "@scribe/runtime/scope.ts";
import { from } from "@scribe/foundation/lib/src/database/tables_base.ts";
import { registerTableOwners } from "@scribe/foundation/lib/src/database/table_owners.ts";
import { READS_EVERY_ROW, UnprovenCallerError } from "@scribe/foundation/lib/src/database/query/owner_scope.ts";
import { clientOf, installDatabaseMock } from "@scribe/foundation/tests/tests/database/mocks/install_database.ts";

interface Preference {
  readonly user_id: string;
  readonly locale: string;
  readonly theme: string;
}

interface Note {
  readonly admin_id: string;
  readonly locale: string;
  readonly theme: string;
}

const PREFERENCES = "t_preferences";
const NOTES = "t_notes";

registerTableOwners({ [PREFERENCES]: "user_id", [NOTES]: "admin_id" });

const USER: RequestUser = {
  id: "u1",
  caller: "authenticated",
  role: "",
  permissions: [],
  claims: { email: "u1@example.com" },
};

const EVERY_ROW: RequestUser = {
  id: "a1",
  caller: "authenticated",
  role: "owner",
  permissions: [READS_EVERY_ROW],
  claims: { email: "a1@example.com" },
};

const OWNER_OF_ONE: RequestUser = { ...EVERY_ROW, permissions: [] };

const SOME_PREFERENCES = [
  { user_id: "u1", locale: "fr", theme: "dark" },
  { user_id: "u2", locale: "en", theme: "light" },
];

const SOME_NOTES = [
  { admin_id: "a1", locale: "fr", theme: "dark" },
  { admin_id: "a2", locale: "en", theme: "light" },
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

Deno.test("scope: a caller reads its own rows of an owned table and no others", async () => {
  const mock = installDatabaseMock({ [PREFERENCES]: [...SOME_PREFERENCES] });
  try {
    const rows = await withIdentity(USER, () => from<Preference>(clientOf(mock), PREFERENCES).get());

    assertEquals(rows.length, 1, "the table is owned, so the read narrowed to the caller");
    assertEquals(rows[0].user_id, "u1", "and it narrowed to the caller's own row");
  } finally {
    mock.restore();
  }
});

Deno.test("scope: the narrowing composes with a filter the caller wrote, it does not replace it", async () => {
  const mock = installDatabaseMock({ [PREFERENCES]: [...SOME_PREFERENCES] });
  try {
    const found = await withIdentity(
      USER,
      () => from<Preference>(clientOf(mock), PREFERENCES).where((f) => f.user_id.eq("u2")).getOne(),
    );

    assertEquals(found, null, "the scope adds user_id = the caller, so the two filters can never both hold");
  } finally {
    mock.restore();
  }
});

Deno.test("scope: a caller reading its own row needs no opt-out", async () => {
  const mock = installDatabaseMock({ [PREFERENCES]: [...SOME_PREFERENCES] });
  try {
    const found = await withIdentity(
      USER,
      () => from<Preference>(clientOf(mock), PREFERENCES).where((f) => f.user_id.eq("u1")).getOne(),
    );

    assertEquals(found?.locale, "fr", "the scope already narrows to the caller, so the filter agrees with it");
  } finally {
    mock.restore();
  }
});

Deno.test("scope: the permission to read every row lifts the narrowing", async () => {
  const mock = installDatabaseMock({ [PREFERENCES]: [...SOME_PREFERENCES] });
  try {
    const rows = await withIdentity(EVERY_ROW, () => from<Preference>(clientOf(mock), PREFERENCES).get());

    assertEquals(rows.length, 2, "nothing narrowed the read, so every row came back");
  } finally {
    mock.restore();
  }
});

Deno.test("scope: the owning column is the one the table declared, not one kind of account", async () => {
  const mock = installDatabaseMock({ [NOTES]: [...SOME_NOTES] });
  try {
    const rows = await withIdentity(OWNER_OF_ONE, () => from<Note>(clientOf(mock), NOTES).get());

    assertEquals(rows.length, 1, "a second table owned on another column narrows the same way");
    assertEquals(rows[0].admin_id, "a1", "and it narrowed on that column, not on user_id");
  } finally {
    mock.restore();
  }
});

Deno.test("scope: a table that declares no owner is read whole", async () => {
  const mock = installDatabaseMock({ t_public: [{ id: 1 }, { id: 2 }] });
  try {
    const rows = await withIdentity(USER, () => from<{ id: number }>(clientOf(mock), "t_public").get());

    assertEquals(rows.length, 2, "there is no column to narrow on, so nothing is narrowed");
  } finally {
    mock.restore();
  }
});

Deno.test("scope: an anonymous caller reads no row of a table somebody owns", async () => {
  const mock = installDatabaseMock({ [PREFERENCES]: [...SOME_PREFERENCES] });
  try {
    const rows = await withIdentity(null, () => from<Preference>(clientOf(mock), PREFERENCES).get());

    assertEquals(rows.length, 0, "proving nobody is not the same as owning every row");
  } finally {
    mock.restore();
  }
});

Deno.test("scope: a path that never resolved a caller is refused, not opened", async () => {
  const mock = installDatabaseMock({ [PREFERENCES]: [...SOME_PREFERENCES] });
  try {
    await assertRejects(
      () => from<Preference>(clientOf(mock), PREFERENCES).get(),
      UnprovenCallerError,
      "with no caller",
    );
  } finally {
    mock.restore();
  }
});

Deno.test("scope: a path with no caller says how to read the table on purpose", async () => {
  const mock = installDatabaseMock({ [PREFERENCES]: [...SOME_PREFERENCES] });
  try {
    const rows = await from<Preference>(clientOf(mock), PREFERENCES).unscoped().get();

    assertEquals(rows.length, 2, "unscoped() is what a worker, a cron and a hook write");
  } finally {
    mock.restore();
  }
});

Deno.test({
  name: "scope: an update only touches the caller's own row",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mock = installDatabaseMock({ [PREFERENCES]: [...SOME_PREFERENCES] });
    try {
      const outcome = await withIdentity(
        USER,
        () => from<Preference>(clientOf(mock), PREFERENCES).update({ theme: "system" }),
      );
      assertEquals(outcome.ok, true);

      const rows = mock.rows(PREFERENCES);
      assertEquals(rows.find((row) => row.user_id === "u1")?.theme, "system");
      assertEquals(rows.find((row) => row.user_id === "u2")?.theme, "light", "the other row was left alone");
    } finally {
      mock.restore();
    }
  },
});

Deno.test("scope: an update with neither a filter nor an identity is refused", async () => {
  const mock = installDatabaseMock({ [PREFERENCES]: [...SOME_PREFERENCES] });
  try {
    const outcome = await withIdentity(
      null,
      () => from<Preference>(clientOf(mock), PREFERENCES).update({ theme: "dark" }),
    );
    assertEquals(outcome.ok, false, "a write that would touch every row is refused");

    assertEquals(mock.rows(PREFERENCES).find((row) => row.user_id === "u2")?.theme, "light");
  } finally {
    mock.restore();
  }
});

Deno.test("scope: unscoped hands back the whole table to a caller that asked for it", async () => {
  const mock = installDatabaseMock({ [PREFERENCES]: [...SOME_PREFERENCES] });
  try {
    const rows = await withIdentity(
      USER,
      () => from<Preference>(clientOf(mock), PREFERENCES).unscoped().get(),
    );

    assertEquals(rows.length, 2);
  } finally {
    mock.restore();
  }
});

Deno.test({
  name: "scope: an insert carries the identifier of the caller",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mock = installDatabaseMock({ [PREFERENCES]: [] });
    try {
      const outcome = await withIdentity(
        USER,
        () => from<Preference>(clientOf(mock), PREFERENCES).insert({ locale: "fr" } as never),
      );
      assertEquals(outcome.ok, true);

      assertEquals(mock.rows(PREFERENCES)[0].user_id, "u1", "the owning column was filled from the caller");
    } finally {
      mock.restore();
    }
  },
});
