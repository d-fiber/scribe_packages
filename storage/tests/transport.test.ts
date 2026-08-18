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

class RecordingBucket implements StorageBucket {
  readonly uploaded: string[] = [];
  readonly removed: string[] = [];
  readonly tree: StorageObjectEntry[] = [];

  upload(path: string): Promise<boolean> {
    this.uploaded.push(path);
    return Promise.resolve(true);
  }

  remove(paths: readonly string[]): Promise<boolean> {
    this.removed.push(...paths);
    return Promise.resolve(true);
  }

  listTree(): Promise<StorageObjectEntry[] | null> {
    return Promise.resolve(this.tree);
  }

  removeTree(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

class RecordingTransport {
  readonly bucket = new RecordingBucket();
  of(_visibility: StorageVisibility): StorageBucket {
    return this.bucket;
  }
}

const avatars = defineStorage({
  path: "people/{account}",
  access: { read: "anyone", write: "users" },
  resources: { avatar: image({ extensions: ["png"], maxSize: Size.megabytes(1) }) },
});

const png = () => new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });

Deno.test("transport: an upload lands on the path the template renders", async () => {
  AccountRoles.use({ withId: () => Promise.resolve(AccountRole.User) });
  const transport = new RecordingTransport();
  StorageTransports.use(transport);

  await withIdentity(USER, async () => {
    const result = await avatars.avatar.upload(png());
    assertEquals(result.ok, true);
  });

  assertEquals(transport.bucket.uploaded, ["people/u1/avatar"]);
});

Deno.test("transport: a removal names the same path", async () => {
  const transport = new RecordingTransport();
  StorageTransports.use(transport);

  await withIdentity(USER, () => avatars.avatar.remove());

  assertEquals(transport.bucket.removed, ["people/u1/avatar"]);
});

Deno.test("transport: with none registered, an upload fails instead of throwing", async () => {
  StorageTransports.use(undefined as never);

  await withIdentity(USER, async () => {
    const result = await avatars.avatar.upload(png());
    assertEquals(result.ok, false);
  });
});
