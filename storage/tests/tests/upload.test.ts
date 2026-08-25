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


import "@scribe/testing/settings.ts";
import { assertEquals } from "@std/assert";
import type { Failure } from "@scribe/alchemy";
import { Bytes, Storage, StorageUploadError, StorageVisibility } from "@scribe/storage/lib/storage.ts";
import { installStorageMock } from "@scribe/storage/tests/testing/mock.ts";
import { installDatabaseFake, installRefusingDatabase } from "./mocks/database.ts";

const reports = Storage.public("reports/{reportId}");
const sheet = reports.file("sheet", { extensions: ["json"], maxSize: Bytes.kilobytes(4) });

function json(bytes = 3): File {
  return new File([new Uint8Array(bytes)], "a.json", { type: "application/json" });
}

function errorOf(result: { ok: boolean }): StorageUploadError {
  return (result as Failure<StorageUploadError>).error;
}

Deno.test("upload: the bytes land on the rendered path, and the index remembers them", async () => {
  const database = installDatabaseFake();
  const transport = installStorageMock();

  const result = await sheet.upload(json(7), "r1");

  assertEquals(result.ok, true);
  assertEquals(transport.uploads, [{
    bucket: "public_bucket",
    path: "reports/r1/sheet",
    contentType: "application/octet-stream",
    byteSize: 7,
  }]);
  assertEquals(database.fake.rows("__storage_objects__"), [{
    path: "reports/r1/sheet",
    visibility: "public",
    mime_type: "application/octet-stream",
    byte_size: 7,
    blur_hash: null,
    updated_at: database.fake.rows("__storage_objects__")[0].updated_at,
  }]);

  transport.restore();
  database.restore();
});

Deno.test("upload: an undeclared extension is refused before the bucket is reached", async () => {
  const database = installDatabaseFake();
  const transport = installStorageMock();

  const result = await sheet.upload(new File([], "a.png", { type: "image/png" }), "r1");

  assertEquals(errorOf(result), StorageUploadError.InvalidType);
  assertEquals(transport.uploads, []);
  assertEquals(database.fake.rows("__storage_objects__"), []);

  transport.restore();
  database.restore();
});

Deno.test("upload: a file over the declared size is refused before the bucket is reached", async () => {
  const database = installDatabaseFake();
  const transport = installStorageMock();

  const result = await sheet.upload(json(5_000), "r1");

  assertEquals(errorOf(result), StorageUploadError.FileTooLarge);
  assertEquals(transport.uploads, []);

  transport.restore();
  database.restore();
});

Deno.test("upload: an argument carrying a traversal is refused before the bucket is reached", async () => {
  const database = installDatabaseFake();
  const transport = installStorageMock();

  const result = await sheet.upload(json(), "../secrets");

  assertEquals(errorOf(result), StorageUploadError.InvalidPath);
  assertEquals(transport.uploads, []);

  transport.restore();
  database.restore();
});

Deno.test("upload: an index that refuses the row fails the upload", async () => {
  const database = installRefusingDatabase();
  const transport = installStorageMock();

  const result = await sheet.upload(json(), "r1");

  assertEquals(errorOf(result), StorageUploadError.IndexFailed);
  assertEquals(transport.uploadedPaths, ["reports/r1/sheet"]);

  transport.restore();
  database.restore();
});

Deno.test("upload: a declaration that changed bucket takes its old bytes away", async () => {
  const database = installDatabaseFake({
    __storage_objects__: [{
      path: "reports/r1/sheet",
      visibility: StorageVisibility.Private,
      mime_type: "application/octet-stream",
      byte_size: 2,
      blur_hash: null,
      updated_at: "2026-08-01T00:00:00.000Z",
    }],
  });
  const transport = installStorageMock();

  const result = await sheet.upload(json(), "r1");

  assertEquals(result.ok, true);
  assertEquals(transport.uploads[0].bucket, "public_bucket");
  assertEquals(transport.removals, [{
    bucket: "private_bucket",
    paths: ["reports/r1/sheet"],
  }]);
  assertEquals(database.fake.rows("__storage_objects__")[0].visibility, "public");

  transport.restore();
  database.restore();
});

Deno.test("upload: a bucket that refuses leaves the index untouched", async () => {
  const database = installDatabaseFake();
  const transport = installStorageMock(false);

  const result = await sheet.upload(json(), "r1");

  assertEquals(errorOf(result), StorageUploadError.UploadFailed);
  assertEquals(database.fake.rows("__storage_objects__"), []);

  transport.restore();
  database.restore();
});

Deno.test("remove: the bytes go, and the row that named them goes with them", async () => {
  const database = installDatabaseFake({
    __storage_objects__: [{
      path: "reports/r1/sheet",
      visibility: "public",
      mime_type: "application/octet-stream",
      byte_size: 2,
      blur_hash: null,
      updated_at: "2026-08-01T00:00:00.000Z",
    }],
  });
  const transport = installStorageMock();

  const result = await sheet.remove("r1");

  assertEquals(result.ok, true);
  assertEquals(transport.removedPaths, ["reports/r1/sheet"]);
  assertEquals(database.fake.rows("__storage_objects__"), []);

  transport.restore();
  database.restore();
});
