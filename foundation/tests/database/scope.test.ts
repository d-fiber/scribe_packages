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
import { database } from "@scribe/foundation/lib/src/database/database.ts";
import { DeviceThemeMode } from "@scribe/core/contracts/enums.ts";
import type { RequestUser } from "@scribe/alchemy/route";
import { RequestIdentityCache } from "@scribe/core/runtime/http/accessors/identity.ts";
import { READS_EVERY_ROW } from "@scribe/foundation/lib/src/database/query/scope.ts";
import { RequestScope } from "@scribe/core/runtime/scope.ts";
import { installDatabaseMock } from "@scribe/foundation/tests/database/mocks/install_database.ts";

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

function withIdentity<T>(
  identity: RequestUser | null,
  run: () => Promise<T>,
): Promise<T> {
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

const SETTINGS = [
  { user_id: "u1", localization: "fr", theme_mode: DeviceThemeMode.DARK },
  { user_id: "u2", localization: "en", theme_mode: "light" },
];

const OWNED_SETTINGS = [
  { admin_id: "a1", localization: "fr", theme_mode: DeviceThemeMode.DARK },
  { admin_id: "a2", localization: "en", theme_mode: "light" },
];

Deno.test("scope: a user only reads its own rows", async () => {
  const mock = installDatabaseMock({
    internal_t__app_user_settings: [...SETTINGS],
  });
  try {
    const rows = await withIdentity(
      USER,
      () => database.internal_t__app_user_settings().get(),
    );
    assertEquals(rows.length, 1);
    assertEquals((rows[0] as { user_id: string }).user_id, "u1");
  } finally {
    mock.restore();
  }
});

Deno.test("scope: an admin sees a whole user table", async () => {
  const mock = installDatabaseMock({
    internal_t__app_user_settings: [...SETTINGS],
  });
  try {
    const rows = await withIdentity(
      EVERY_ROW,
      () => database.internal_t__app_user_settings().get(),
    );
    assertEquals(
      rows.length,
      2,
      "an admin reading a user table gets every row of it",
    );
  } finally {
    mock.restore();
  }
});

Deno.test("scope: a caller is bounded on a table it owns rows of", async () => {
  const mock = installDatabaseMock({
    internal_t__admin_users_settings: [...OWNED_SETTINGS],
  });
  const owner: RequestUser = { ...EVERY_ROW, permissions: [] };
  try {
    const rows = await withIdentity(
      owner,
      () => database.internal_t__admin_users_settings().get(),
    );
    assertEquals(
      rows.length,
      1,
      "the table is owned, so the read narrowed to one row",
    );
    assertEquals(
      (rows[0] as { admin_id: string }).admin_id,
      "a1",
      "and it is the caller's row",
    );
  } finally {
    mock.restore();
  }
});

Deno.test("scope: the permission to read every row lifts the narrowing", async () => {
  const mock = installDatabaseMock({
    internal_t__admin_users_settings: [...OWNED_SETTINGS],
  });
  try {
    const rows = await withIdentity(
      EVERY_ROW,
      () => database.internal_t__admin_users_settings().get(),
    );
    assertEquals(
      rows.length,
      2,
      "nothing narrowed the read, so every row came back",
    );
  } finally {
    mock.restore();
  }
});

Deno.test("scope: without an identity, service scope (no filter)", async () => {
  const mock = installDatabaseMock({
    internal_t__app_user_settings: [...SETTINGS],
  });
  try {
    const rows = await withIdentity(
      null,
      () => database.internal_t__app_user_settings().get(),
    );
    assertEquals(
      rows.length,
      2,
      "with nobody to scope to, the read runs unfiltered",
    );
  } finally {
    mock.restore();
  }
});

Deno.test({
  name: "scope: a user's update only touches its own row",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mock = installDatabaseMock({
      internal_t__app_user_settings: [...SETTINGS],
    });
    try {
      const ok = await withIdentity(
        USER,
        () =>
          database.internal_t__app_user_settings().update({
            theme_mode: DeviceThemeMode.SYSTEM,
          }),
      );
      assertEquals(ok, true);

      const rows = mock.rows("internal_t__app_user_settings");
      assertEquals(rows.find((r) => r.user_id === "u1")?.theme_mode, "system");
      assertEquals(rows.find((r) => r.user_id === "u2")?.theme_mode, "light");
    } finally {
      mock.restore();
    }
  },
});

Deno.test("scope: an update without filter or identity is refused", async () => {
  const mock = installDatabaseMock({
    internal_t__app_user_settings: [...SETTINGS],
  });
  try {
    const ok = await withIdentity(
      null,
      () =>
        database.internal_t__app_user_settings().update({
          theme_mode: DeviceThemeMode.DARK,
        }),
    );
    assertEquals(ok, false);

    const rows = mock.rows("internal_t__app_user_settings");
    assertEquals(rows.find((r) => r.user_id === "u2")?.theme_mode, "light");
  } finally {
    mock.restore();
  }
});

Deno.test("scope: .unscoped() returns the whole table to a user", async () => {
  const mock = installDatabaseMock({
    internal_t__app_user_settings: [...SETTINGS],
  });
  try {
    const rows = await withIdentity(
      USER,
      () => database.internal_t__app_user_settings().unscoped().get(),
    );
    assertEquals(rows.length, 2);
  } finally {
    mock.restore();
  }
});

Deno.test({
  name: "scope: an insert carries the id of the caller",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mock = installDatabaseMock({ internal_t__app_user_settings: [] });
    try {
      const ok = await withIdentity(
        USER,
        () =>
          database.internal_t__app_user_settings().insert(
            { localization: "fr" } as never,
          ),
      );
      assertEquals(ok, true);
      assertEquals(mock.rows("internal_t__app_user_settings")[0].user_id, "u1");
    } finally {
      mock.restore();
    }
  },
});
