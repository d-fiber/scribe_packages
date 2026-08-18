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

import { AccountRole } from "@scribe/core/contracts/account.ts";
import type { Failure } from "@scribe/core/contracts/result.ts";
import {
  RequestIdentityCache,
  type RequestUser,
} from "@scribe/core/runtime/http/accessors/identity.ts";
import { RequestScope } from "@scribe/core/runtime/scope.ts";
import "@scribe/core/testing/settings.ts";
import {
  AccountRoles,
  defineStorage,
  image,
  Size,
  StorageUploadError,
} from "@scribe/storage/mod.ts";
import { assertEquals } from "@std/assert";

const USER = { id: "u1", email: "u1@example.com" };
const ADMIN = {
  id: "a1",
  email: "a1@example.com",
  rules: { role: "owner", permissions: [] },
};

function withIdentity<T>(
  identity: RequestUser,
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

const usersOnly = defineStorage({
  path: "things/{account}",
  access: { read: "anyone", write: "users" },
  resources: {
    avatar: image({ extensions: ["png"], maxSize: Size.megabytes(1) }),
  },
});

const owned = defineStorage({
  path: "owned/{account}/{thing}",
  access: {
    read: "anyone",
    write: { by: "users", owns: (_account, args) => args.thing === "mine" },
  },
  resources: {
    avatar: image({ extensions: ["png"], maxSize: Size.megabytes(1) }),
  },
});

const png = () =>
  new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });

Deno.test("access: no session, no upload", async () => {
  const result = await usersOnly.avatar.upload(png());
  assertEquals(result.ok, false);
});

Deno.test("access: a writer of the wrong role is refused", async () => {
  await withIdentity(ADMIN, async () => {
    const result = await usersOnly.avatar.upload(png());
    assertEquals(result.ok, false);
    assertEquals(
      (result as Failure<StorageUploadError>).error,
      StorageUploadError.Unauthorized,
    );
  });
});

Deno.test("access: an unowned target is refused before any I/O", async () => {
  AccountRoles.use({ withId: () => Promise.resolve(AccountRole.User) });

  await withIdentity(USER, async () => {
    const result = await owned.avatar.upload(png(), "not-mine");
    assertEquals(result.ok, false);
    assertEquals(
      (result as Failure<StorageUploadError>).error,
      StorageUploadError.Unauthorized,
    );
  });
});

Deno.test(
  "access: with no AccountRoleSource registered, ownership denies",
  async () => {
    AccountRoles.use(undefined as never);

    await withIdentity(USER, async () => {
      const result = await owned.avatar.upload(png(), "mine");
      assertEquals(result.ok, false);
      assertEquals(
        (result as Failure<StorageUploadError>).error,
        StorageUploadError.Unauthorized,
      );
    });
  },
);

Deno.test("access: url() yields nothing without a session", () => {
  assertEquals(usersOnly.avatar.url(), null);
});
