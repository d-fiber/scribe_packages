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

// internal_t__admin_users & friends are owned by `admin_id`, so every query an
// authenticated admin runs is silently narrowed to their own row. That is what
// we want for "my account" endpoints, and exactly what breaks team management,
// where an admin acts on *another* admin. These tests pin both halves.

import { database } from "@scribe/foundation/src/database/database.ts";
import { installDatabaseMock } from "@scribe/foundation/tests/database/mocks/install_database.ts";
import { RequestIdentityCache } from "@scribe/core/runtime/http/accessors/identity.ts";
import { RequestScope } from "@scribe/core/runtime/scope.ts";
import { assertEquals, assertNotEquals } from "@std/assert";

const CALLER = "admin-caller";
const OTHER = "admin-other";

function seed() {
  return installDatabaseMock({
    internal_t__admin_users: [
      { admin_id: CALLER, role: "owner", email: "caller@example.com" },
      { admin_id: OTHER, role: "viewer", email: "other@example.com" },
    ],
  });
}

function asCaller<T>(run: () => Promise<T>): Promise<T> {
  const request = new Request("http://admin.test/");
  return RequestScope.run(request, new Uint8Array(0), async () => {
    await RequestIdentityCache.remember(() =>
      Promise.resolve({
        id: CALLER,
        email: "caller@example.com",
        rules: { role: "owner", permissions: [] },
      })
    );
    return await run();
  }, "127.0.0.1");
}

const readRole = (adminId: string, unscoped: boolean) => {
  const query = database.internal_t__admin_users();
  return (unscoped ? query.unscoped() : query)
    .select((s) => ({ role: s.role }))
    .where((f) => f.admin_id.eq(adminId))
    .getOne();
};

Deno.test("owner scope: a scoped read of another admin yields nothing", async () => {
  const mock = seed();
  try {
    assertEquals(
      await asCaller(() => readRole(OTHER, false)),
      null,
      "the owner scope adds admin_id = caller, so the two filters can never both hold",
    );
  } finally {
    mock.restore();
  }
});

Deno.test("owner scope: a scoped read of yourself still works", async () => {
  const mock = seed();
  try {
    assertNotEquals(await asCaller(() => readRole(CALLER, false)), null);
  } finally {
    mock.restore();
  }
});

Deno.test("owner scope: unscoped() is what makes team management possible", async () => {
  const mock = seed();
  try {
    const target = await asCaller(() => readRole(OTHER, true));

    assertEquals(
      target?.role,
      "viewer",
      "every /team endpoint acts on another admin and must opt out of the scope, authorisation being enforced by permission() + memberAuthority()",
    );
  } finally {
    mock.restore();
  }
});

Deno.test("owner scope: without an identity there is nothing to scope to", async () => {
  const mock = seed();
  try {
    const request = new Request("http://admin.test/");
    const target = await RequestScope.run(
      request,
      new Uint8Array(0),
      () => readRole(OTHER, false),
      "127.0.0.1",
    );

    assertNotEquals(
      target,
      null,
      "service and anonymous flows keep reading freely: the scope only binds a signed-in caller",
    );
  } finally {
    mock.restore();
  }
});
