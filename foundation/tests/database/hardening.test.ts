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

import { assertEquals, assertRejects } from "@std/assert";
import { database } from "@scribe/foundation/src/database/database.ts";
import { OwnerScopeError } from "@scribe/foundation/src/database/query/builder.ts";
import { RequestIdentityCache, type RequestUser } from "@scribe/core/runtime/http/accessors/identity.ts";
import { RequestScope } from "@scribe/core/runtime/scope.ts";
import { installDatabaseMock } from "@scribe/foundation/tests/database/mocks/install_database.ts";

const USER = { id: "u1", email: "u1@example.com" };
const ADMIN = {
  id: "a1",
  email: "a1@example.com",
  rules: { role: "owner", permissions: [] },
};

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

const ADMIN_DEVICES = [
  { id: "d1", admin_id: "a1", device_id: "x1" },
  { id: "d2", admin_id: "a2", device_id: "x2" },
];

const TEMPLATES = [
  { id: "t1", name: "welcome" },
  { id: "t2", name: "reset" },
];

const templates = () => database.internal_t__email_templates();

Deno.test("cross-owner: a user cannot sweep an admin-owned table", async () => {
  const mock = installDatabaseMock({
    internal_t__admin_users_devices: [...ADMIN_DEVICES],
  });
  try {
    await assertRejects(
      () => withIdentity(USER, () => database.internal_t__admin_users_devices().get()),
      OwnerScopeError,
    );
  } finally {
    mock.restore();
  }
});

Deno.test("cross-owner: an explicit predicate on the owner column is allowed", async () => {
  const mock = installDatabaseMock({
    internal_t__admin_users_devices: [...ADMIN_DEVICES],
  });
  try {
    const rows = await withIdentity(
      USER,
      () =>
        database.internal_t__admin_users_devices()
          .where((f) => f.admin_id.eq("a2"))
          .get(),
    );
    assertEquals(rows.length, 1);
  } finally {
    mock.restore();
  }
});

Deno.test("cross-owner: .unscoped() stays the deliberate way through", async () => {
  const mock = installDatabaseMock({
    internal_t__admin_users_devices: [...ADMIN_DEVICES],
  });
  try {
    const rows = await withIdentity(
      USER,
      () => database.internal_t__admin_users_devices().unscoped().get(),
    );
    assertEquals(rows.length, 2);
  } finally {
    mock.restore();
  }
});

Deno.test("cross-owner: an admin reading a user table is untouched", async () => {
  const mock = installDatabaseMock({
    internal_t__app_user_settings: [
      { user_id: "u1", theme_mode: "dark" },
      { user_id: "u2", theme_mode: "light" },
    ],
  });
  try {
    const rows = await withIdentity(ADMIN, () => database.internal_t__app_user_settings().get());
    assertEquals(rows.length, 2);
  } finally {
    mock.restore();
  }
});

Deno.test("unbounded write: an unowned table is no longer a free-for-all", async () => {
  const mock = installDatabaseMock({ internal_t__email_templates: [...TEMPLATES] });
  try {
    const ok = await withIdentity(ADMIN, () => templates().delete());
    assertEquals(ok, false);
    assertEquals(mock.rows("internal_t__email_templates").length, 2);
  } finally {
    mock.restore();
  }
});

Deno.test("unbounded write: .entireTable() is the explicit opt-in", async () => {
  const mock = installDatabaseMock({ internal_t__email_templates: [...TEMPLATES] });
  try {
    const ok = await withIdentity(ADMIN, () => templates().entireTable().delete());
    assertEquals(ok, true);
    assertEquals(mock.rows("internal_t__email_templates").length, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("unbounded write: deleteOne without a predicate is refused too", async () => {
  const mock = installDatabaseMock({ internal_t__email_templates: [...TEMPLATES] });
  try {
    const row = await withIdentity(ADMIN, () => templates().deleteOne());
    assertEquals(row, null);
    assertEquals(mock.rows("internal_t__email_templates").length, 2);
  } finally {
    mock.restore();
  }
});

Deno.test("insert: an explicit null owner is filled in, not written", async () => {
  const mock = installDatabaseMock({ internal_t__app_user_settings: [] });
  try {
    await withIdentity(
      USER,
      () => database.internal_t__app_user_settings().insert({ user_id: null } as never),
    );
    assertEquals(mock.rows("internal_t__app_user_settings")[0]?.user_id, "u1");
  } finally {
    mock.restore();
  }
});
