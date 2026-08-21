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


import "@scribe/core/testing/settings.ts";
import { assertEquals } from "@std/assert";
import { Size, Storage, StorageVisibility } from "@scribe/storage/mod.ts";
import type { FakePostgrestSeed } from "@scribe/foundation/testing/database.ts";
import { installStorageMock } from "@scribe/storage/testing/mock.ts";
import { installDatabaseFake } from "./mocks/database.ts";

const shelves = Storage.public("shelves/{shelfId}");
shelves.file("label", { extensions: ["json"], maxSize: Size.kilobytes(4) });

function storedAt(path: string, visibility = StorageVisibility.Public) {
  return {
    path,
    visibility,
    mime_type: "application/octet-stream",
    byte_size: 4,
    blur_hash: null,
    updated_at: "2026-08-01T00:00:00.000Z",
  };
}

function seededWith(paths: readonly string[]): FakePostgrestSeed {
  return { __storage_objects__: paths.map((path) => storedAt(path)) };
}

Deno.test("list: a folder answers what the index holds under it, in path order", async () => {
  const database = installDatabaseFake(seededWith(["shelves/s1/b", "shelves/s1/a"]));

  const result = await shelves.list("s1");

  assertEquals(result.ok, true);
  assertEquals(result.ok && result.data.map((object) => object.path), [
    "shelves/s1/a",
    "shelves/s1/b",
  ]);

  database.restore();
});

Deno.test("list: an object carries what a walk of the bucket could not have said", async () => {
  const database = installDatabaseFake({
    __storage_objects__: [{
      path: "shelves/s1/photo",
      visibility: StorageVisibility.Private,
      mime_type: "image/png",
      byte_size: 512,
      blur_hash: "LEHV6nWB2yk8",
      updated_at: "2026-08-01T00:00:00.000Z",
    }],
  });

  const result = await shelves.list("s1");

  assertEquals(result.ok && result.data, [{
    path: "shelves/s1/photo",
    url: "http://localhost:4001/storage/v1/object/private_bucket/shelves/s1/photo",
    visibility: StorageVisibility.Private,
    mimeType: "image/png",
    byteSize: 512,
    blurHash: "LEHV6nWB2yk8",
    updatedAt: "2026-08-01T00:00:00.000Z",
  }]);

  database.restore();
});

Deno.test("list: a neighbour whose name differs by the character like treats as a joker stays out", async () => {
  const database = installDatabaseFake(seededWith(["shelf_1/mine", "shelfX1/theirs"]));
  const shelf = Storage.public("{shelfName}");

  const result = await shelf.list("shelf_1");

  assertEquals(result.ok && result.data.map((object) => object.path), ["shelf_1/mine"]);

  database.restore();
});

Deno.test("clear: a folder empties beyond one page, and forgets every row it removed", async () => {
  const paths = Array.from({ length: 2_500 }, (_, i) => `shelves/s1/${String(i).padStart(5, "0")}`);
  const database = installDatabaseFake(seededWith(paths));
  const transport = installStorageMock();

  const result = await shelves.clear("s1");

  assertEquals(result.ok, true);
  assertEquals(transport.removedPaths.length, 2_500);
  assertEquals(database.fake.rows("__storage_objects__"), []);

  transport.restore();
  database.restore();
});

Deno.test("clear: the removals are grouped by the bucket each object is in", async () => {
  const database = installDatabaseFake({
    __storage_objects__: [
      storedAt("shelves/s1/open", StorageVisibility.Public),
      storedAt("shelves/s1/shut", StorageVisibility.Private),
    ],
  });
  const transport = installStorageMock();

  const result = await shelves.clear("s1");

  assertEquals(result.ok, true);
  assertEquals(transport.removals, [
    { bucket: "public_bucket", paths: ["shelves/s1/open"] },
    { bucket: "private_bucket", paths: ["shelves/s1/shut"] },
  ]);

  transport.restore();
  database.restore();
});

Deno.test("clear: a page holding nothing but a neighbour's objects still moves on", async () => {
  const neighbours = Array.from(
    { length: 1_000 },
    (_, i) => `shelfX1/${String(i).padStart(5, "0")}`,
  );
  const database = installDatabaseFake(seededWith([...neighbours, "shelf_1/mine"]));
  const transport = installStorageMock();

  const result = await Storage.public("{clearedName}").clear("shelf_1");

  assertEquals(result.ok, true);
  assertEquals(transport.removedPaths, ["shelf_1/mine"]);
  assertEquals(database.fake.rows("__storage_objects__").length, 1_000);

  transport.restore();
  database.restore();
});

Deno.test("clear: an argument carrying a traversal removes nothing at all", async () => {
  const database = installDatabaseFake(seededWith(["shelves/s1/a"]));
  const transport = installStorageMock();

  const result = await shelves.clear("../..");

  assertEquals(result.ok, false);
  assertEquals(transport.removals, []);

  transport.restore();
  database.restore();
});
