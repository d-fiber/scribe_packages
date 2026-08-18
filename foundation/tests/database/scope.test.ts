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

import { assertEquals } from "@std/assert";
import { database } from "@scribe/foundation/src/database/database.ts";
import { DeviceThemeMode } from "@scribe/core/contracts/enums.ts";
import { RequestIdentityCache, type RequestUser } from "@scribe/core/runtime/http/accessors/identity.ts";
import { RequestScope } from "@scribe/core/runtime/scope.ts";
import { installDatabaseMock } from "@scribe/foundation/tests/database/mocks/install_database.ts";

const USER = { id: "u1", email: "u1@example.com" };
const ADMIN = {
  id: "a1",
  email: "a1@example.com",
  rules: { role: "owner", permissions: [] },
};

// The builder reads `currentIdentity()`, which reads the request scope: we
// therefore open a scope and install an already-resolved identity in it, exactly
// like `resolveIdentity` does in production.
function withIdentity<T>(identity: RequestUser, run: () => Promise<T>): Promise<T> {
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

const ADMIN_SETTINGS = [
  { admin_id: "a1", localization: "fr", theme_mode: DeviceThemeMode.DARK },
  { admin_id: "a2", localization: "en", theme_mode: "light" },
];

Deno.test("scope: a user only reads its own rows", async () => {
  const mock = installDatabaseMock({ internal_t__app_user_settings: [...SETTINGS] });
  try {
    const rows = await withIdentity(USER, () => database.internal_t__app_user_settings().get());
    assertEquals(rows.length, 1);
    assertEquals((rows[0] as { user_id: string }).user_id, "u1");
  } finally {
    mock.restore();
  }
});

Deno.test("scope: an admin sees a whole user table", async () => {
  const mock = installDatabaseMock({ internal_t__app_user_settings: [...SETTINGS] });
  try {
    const rows = await withIdentity(ADMIN, () => database.internal_t__app_user_settings().get());
    assertEquals(rows.length, 2);
  } finally {
    mock.restore();
  }
});

Deno.test("scope: an admin is bounded on an admin table", async () => {
  const mock = installDatabaseMock({
    internal_t__admin_users_settings: [...ADMIN_SETTINGS],
  });
  try {
    const rows = await withIdentity(ADMIN, () => database.internal_t__admin_users_settings().get());
    assertEquals(rows.length, 1);
    assertEquals((rows[0] as { admin_id: string }).admin_id, "a1");
  } finally {
    mock.restore();
  }
});

Deno.test("scope: without an identity, service scope (no filter)", async () => {
  const mock = installDatabaseMock({ internal_t__app_user_settings: [...SETTINGS] });
  try {
    const rows = await withIdentity(null, () => database.internal_t__app_user_settings().get());
    assertEquals(rows.length, 2);
  } finally {
    mock.restore();
  }
});

// Both write tests trigger cache invalidation, hence the real
// Redis client (lazy connection → timer). That is not what this test is about.
Deno.test({
  name: "scope: a user's update only touches its own row",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mock = installDatabaseMock({ internal_t__app_user_settings: [...SETTINGS] });
    try {
      const ok = await withIdentity(
        USER,
        () => database.internal_t__app_user_settings().update({ theme_mode: DeviceThemeMode.SYSTEM }),
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
  const mock = installDatabaseMock({ internal_t__app_user_settings: [...SETTINGS] });
  try {
    const ok = await withIdentity(
      null,
      () => database.internal_t__app_user_settings().update({ theme_mode: DeviceThemeMode.DARK }),
    );
    assertEquals(ok, false);

    const rows = mock.rows("internal_t__app_user_settings");
    assertEquals(rows.find((r) => r.user_id === "u2")?.theme_mode, "light");
  } finally {
    mock.restore();
  }
});

Deno.test("scope: .unscoped() returns the whole table to a user", async () => {
  const mock = installDatabaseMock({ internal_t__app_user_settings: [...SETTINGS] });
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
        () => database.internal_t__app_user_settings().insert({ localization: "fr" } as never),
      );
      assertEquals(ok, true);
      assertEquals(mock.rows("internal_t__app_user_settings")[0].user_id, "u1");
    } finally {
      mock.restore();
    }
  },
});
