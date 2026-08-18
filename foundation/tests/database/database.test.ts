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
import { createDatabaseMock } from "@scribe/foundation/tests/database/mocks/database.ts";

Deno.test("FakePostgrestClient: select applies where/order/range", async () => {
  const mock = createDatabaseMock({
    widgets: [
      { id: "1", position: 3 },
      { id: "2", position: 1 },
      { id: "3", position: 2 },
    ],
  });

  const { data } = await mock.db
    .from("widgets")
    .select("*")
    .order("position")
    .range(0, 1);

  assertEquals(
    (data as { id: string }[]).map((row) => row.id),
    ["2", "3"],
  );
});

Deno.test(
  "FakePostgrestClient: insert appends and update/delete respect filters",
  async () => {
    const mock = createDatabaseMock({ widgets: [] });

    await mock.db.from("widgets").insert({ id: "1", name: "a" });
    await mock.db.from("widgets").insert({ id: "2", name: "b" });
    assertEquals(mock.rows("widgets"), [
      { id: "1", name: "a" },
      { id: "2", name: "b" },
    ]);

    await mock.db.from("widgets").update({ name: "a2" }).eq("id", "1");
    assertEquals(mock.rows("widgets"), [
      { id: "1", name: "a2" },
      { id: "2", name: "b" },
    ]);

    await mock.db.from("widgets").delete().eq("id", "2");
    assertEquals(mock.rows("widgets"), [{ id: "1", name: "a2" }]);
  },
);

Deno.test(
  "DatabaseMock: a generated table method reads through the fake db",
  async () => {
    const mock = createDatabaseMock({
      internal_t__admin_users_roles: [{ role: "owner" }, { role: "viewer" }],
    });

    const found = await mock.service
      .internal_t__admin_users_roles()
      .select((s) => ({ role: s.role }))
      .where((f) => f.role.eq("owner"))
      .getOne();

    assertEquals(found, { role: "owner" });
  },
);
