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

import { database } from "@scribe/foundation/src/database/database.ts";
import { assertEquals } from "@std/assert";
import { installDatabaseMock } from "@scribe/foundation/tests/database/mocks/install_database.ts";

Deno.test(
  "installDatabaseMock: shadows database's table methods and restores them",
  async () => {
    const mock = installDatabaseMock({
      internal_t__admin_users_roles: [{ role: "owner" }],
    });

    const found = await database
      .internal_t__admin_users_roles()
      .where((f) => f.role.eq("owner"))
      .getOne();
    assertEquals(found?.role, "owner", "the query read the row the mock was given");

    mock.restore();
    assertEquals(
      Object.getOwnPropertyNames(database).includes("internal_t__admin_users_roles"),
      false,
      "restore() took its own properties back off database, which is all this can check: "
        + "calling a table method again would reach the real client, and that one reads a "
        + "request scope no test has outside the server",
    );
  },
);
