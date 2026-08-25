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
import { assertEquals } from "@std/assert";
import type { RequestUser } from "@scribe/alchemy/route";
import { RequestIdentityCache } from "@scribe/runtime/http/accessors/identity.ts";
import { RequestScope } from "@scribe/runtime/scope.ts";
import { from } from "@scribe/foundation/lib/src/database/tables_base.ts";
import { registerTableOwners } from "@scribe/foundation/lib/src/database/table_owners.ts";
import { READS_EVERY_ROW } from "@scribe/foundation/lib/src/database/query/owner_scope.ts";
import { clientOf, installDatabaseMock } from "@scribe/foundation/tests/tests/database/mocks/install_database.ts";

interface Device {
  readonly id: string;
  readonly admin_id: string;
  readonly device_id: string;
}

interface Template {
  readonly id: string;
  readonly name: string;
}

interface Preference {
  readonly user_id: string;
  readonly theme: string;
}

const DEVICES = "t_devices";
const TEMPLATES = "t_templates";
const PREFERENCES = "t_prefs";

registerTableOwners({ [DEVICES]: "admin_id", [PREFERENCES]: "user_id" });

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

const SOME_DEVICES = [
  { id: "d1", admin_id: "a1", device_id: "x1" },
  { id: "d2", admin_id: "a2", device_id: "x2" },
];

const SOME_TEMPLATES = [
  { id: "t1", name: "welcome" },
  { id: "t2", name: "reset" },
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

Deno.test("cross-owner: a caller reads no row of a table whose owning column never names it", async () => {
  const mock = installDatabaseMock({ [DEVICES]: [...SOME_DEVICES] });
  try {
    const rows = await withIdentity(USER, () => from<Device>(clientOf(mock), DEVICES).get());

    assertEquals(rows.length, 0, "the read narrowed to the caller, and the caller owns none of it");
  } finally {
    mock.restore();
  }
});

Deno.test("cross-owner: naming another owner in the predicate does not widen the read", async () => {
  const mock = installDatabaseMock({ [DEVICES]: [...SOME_DEVICES] });
  try {
    const rows = await withIdentity(
      USER,
      () => from<Device>(clientOf(mock), DEVICES).where((f) => f.admin_id.eq("a2")).get(),
    );

    assertEquals(rows.length, 0, "the scope narrows on top of the predicate, it is not replaced by it");
  } finally {
    mock.restore();
  }
});

Deno.test("cross-owner: unscoped stays the deliberate way through", async () => {
  const mock = installDatabaseMock({ [DEVICES]: [...SOME_DEVICES] });
  try {
    const rows = await withIdentity(USER, () => from<Device>(clientOf(mock), DEVICES).unscoped().get());

    assertEquals(rows.length, 2);
  } finally {
    mock.restore();
  }
});

Deno.test("cross-owner: the permission to read every row reaches a table the caller owns nothing of", async () => {
  const mock = installDatabaseMock({
    [PREFERENCES]: [{ user_id: "u1", theme: "dark" }, { user_id: "u2", theme: "light" }],
  });
  try {
    const rows = await withIdentity(EVERY_ROW, () => from<Preference>(clientOf(mock), PREFERENCES).get());

    assertEquals(rows.length, 2);
  } finally {
    mock.restore();
  }
});

Deno.test("unbounded write: a table that declares no owner is not a free-for-all", async () => {
  const mock = installDatabaseMock({ [TEMPLATES]: [...SOME_TEMPLATES] });
  try {
    const outcome = await withIdentity(EVERY_ROW, () => from<Template>(clientOf(mock), TEMPLATES).delete());

    assertEquals(outcome.ok, false);
    assertEquals(mock.rows(TEMPLATES).length, 2, "nothing was removed");
  } finally {
    mock.restore();
  }
});

Deno.test("unbounded write: entireTable is the explicit opt-in", async () => {
  const mock = installDatabaseMock({ [TEMPLATES]: [...SOME_TEMPLATES] });
  try {
    const outcome = await withIdentity(
      EVERY_ROW,
      () => from<Template>(clientOf(mock), TEMPLATES).entireTable().delete(),
    );

    assertEquals(outcome.ok, true);
    assertEquals(mock.rows(TEMPLATES).length, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("unbounded write: deleteOne without a predicate is refused too", async () => {
  const mock = installDatabaseMock({ [TEMPLATES]: [...SOME_TEMPLATES] });
  try {
    const outcome = await withIdentity(
      EVERY_ROW,
      () => from<Template>(clientOf(mock), TEMPLATES).deleteOne(),
    );

    assertEquals(outcome.ok, false);
    assertEquals(mock.rows(TEMPLATES).length, 2);
  } finally {
    mock.restore();
  }
});

Deno.test("insert: an owner written as null is filled in from the caller, not written", async () => {
  const mock = installDatabaseMock({ [PREFERENCES]: [] });
  try {
    await withIdentity(
      USER,
      () => from<Preference>(clientOf(mock), PREFERENCES).insert({ user_id: null } as never),
    );

    assertEquals(mock.rows(PREFERENCES)[0]?.user_id, "u1");
  } finally {
    mock.restore();
  }
});

Deno.test("a write says which of the four things happened, not just whether it happened", async () => {
  const mock = installDatabaseMock({ [TEMPLATES]: [...SOME_TEMPLATES] });
  try {
    const refused = await withIdentity(
      EVERY_ROW,
      () => from<Template>(clientOf(mock), TEMPLATES).delete(),
    );
    assertEquals(refused.ok, false);
    assertEquals(refused.ok === false && refused.error.kind, "denied");

    const removed = await withIdentity(
      EVERY_ROW,
      () => from<Template>(clientOf(mock), TEMPLATES).where((f) => f.id.eq("t1")).delete(),
    );
    assertEquals(removed.ok, true);
    assertEquals(removed.ok === true && removed.data, 1);

    const none = await withIdentity(
      EVERY_ROW,
      () => from<Template>(clientOf(mock), TEMPLATES).where((f) => f.id.eq("nothing")).delete(),
    );
    assertEquals(none.ok, true, "no row matched is not the same as refused");
    assertEquals(none.ok === true && none.data, 0);
  } finally {
    mock.restore();
  }
});
