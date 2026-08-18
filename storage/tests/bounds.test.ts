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

import "@scribe/core/testing/settings.ts";
import { assertEquals } from "@std/assert";
import { AccountRole } from "@scribe/core/contracts/account.ts";
import { RequestIdentityCache, type RequestUser } from "@scribe/core/runtime/http/accessors/identity.ts";
import { RequestScope } from "@scribe/core/runtime/scope.ts";
import {
  AccountRoles,
  defineStorage,
  image,
  Size,
  type StorageBucket,
  type StorageObjectEntry,
  StorageTransports,
  type StorageVisibility,
} from "@scribe/storage/mod.ts";

const USER = { id: "u1", email: "u1@example.com" };

function withUser<T>(run: () => Promise<T>): Promise<T> {
  return RequestScope.run(
    new Request("http://test.local/"),
    new Uint8Array(0),
    async () => {
      await RequestIdentityCache.remember(() => Promise.resolve(USER as RequestUser));
      return await run();
    },
    "127.0.0.1",
  );
}

class HugeBucket implements StorageBucket {
  readonly asked: number[] = [];
  constructor(private readonly available: number) {}

  upload(): Promise<boolean> {
    return Promise.resolve(true);
  }
  remove(): Promise<boolean> {
    return Promise.resolve(true);
  }
  listTree(_prefix: string, limit: number): Promise<StorageObjectEntry[] | null> {
    this.asked.push(limit);
    const n = Math.min(limit, this.available);
    return Promise.resolve(
      Array.from({ length: n }, (_, i) => ({ path: `p/${i}`, updatedAt: null })),
    );
  }
  removeTree(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

function staged(available: number) {
  const bucket = new HugeBucket(available);
  StorageTransports.use({ of: (_v: StorageVisibility) => bucket });
  AccountRoles.use({ withId: () => Promise.resolve(AccountRole.User) });
  return bucket;
}

const folder = defineStorage({
  path: "things/{account}",
  access: { read: "anyone", write: "users" },
  resources: { avatar: image({ extensions: ["png"], maxSize: Size.megabytes(1) }) },
});

Deno.test("bounds: list() never materialises a whole tree", async () => {
  const bucket = staged(1_000_000);

  const result = await withUser(() => folder.list());

  assertEquals(result.ok, true);
  assertEquals(result.ok && result.data.length, 5_000);
  assertEquals(bucket.asked[0], 5_000);
});

Deno.test("bounds: the budget is shared across the two buckets, not doubled", async () => {
  const bucket = staged(3_000);

  const result = await withUser(() => folder.list());

  assertEquals(result.ok && result.data.length, 5_000);
  assertEquals(bucket.asked, [5_000, 2_000]);
});

Deno.test("bounds: a small tree is returned whole, untouched", async () => {
  staged(12);

  const result = await withUser(() => folder.list());

  assertEquals(result.ok && result.data.length, 24);
});

Deno.test("bounds: a listing failure is reported, never a partial result", async () => {
  StorageTransports.use({
    of: () => ({
      upload: () => Promise.resolve(true),
      remove: () => Promise.resolve(true),
      listTree: () => Promise.resolve(null),
      removeTree: () => Promise.resolve(true),
    }),
  });

  const result = await withUser(() => folder.list());
  assertEquals(result.ok, false);
});
