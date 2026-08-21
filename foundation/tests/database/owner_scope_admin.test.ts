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

import { database } from "@scribe/foundation/lib/src/database/database.ts";
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
    assertNotEquals(
      await asCaller(() => readRole(CALLER, false)),
      null,
      "reading your own row needs no opt-out, since the scope already narrows to it",
    );
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
