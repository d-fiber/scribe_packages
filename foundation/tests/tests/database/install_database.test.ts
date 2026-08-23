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

import { database } from "@scribe/foundation/lib/src/database/database_client.ts";
import { assertEquals } from "@std/assert";
import { clientOf, installDatabaseMock } from "@scribe/foundation/tests/tests/database/mocks/install_database.ts";
import { from } from "@scribe/foundation/lib/src/database/tables_base.ts";

Deno.test("installDatabaseMock: a query written against the fake reads the rows it was given", async () => {
  const mock = installDatabaseMock({ t_roles: [{ role: "owner" }] });
  try {
    const found = await from<{ role: string }>(clientOf(mock), "t_roles")
      .where((f) => f.role.eq("owner"))
      .getOne();

    assertEquals(found?.role, "owner");
  } finally {
    mock.restore();
  }
});

Deno.test("installDatabaseMock: rpc goes through the fake, and restore takes it back off", async () => {
  const mock = installDatabaseMock();
  mock.onRpc("count_roles", () => 3);

  const answered = await database.rpc<{ n: number }>("count_roles");
  assertEquals(answered.data, 3, "the call went through the fake, not the real client");

  mock.restore();
  assertEquals(
    Object.getOwnPropertyNames(database).includes("rpc"),
    false,
    "restore() took its own property back off database, which is all this can check: calling rpc " +
      "again would reach the real client, and that one reads settings no test has outside the server",
  );
});
