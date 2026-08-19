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


import { assert, assertEquals } from "@std/assert";
import { fetchObject, report, requireStack, RUN_ID, STACK, useStack } from "./support/stack.ts";

await requireStack();
await useStack();

const { Size, Storage, StorageVisibility } = await import("@scribe/storage/mod.ts");
const { storageObjects } = await import("@scribe/storage/src/db/tables.ts");

const notes = Storage.public(`e2e-${RUN_ID}/{ownerId}`);
const note = notes.file("note", { extensions: ["png"], maxSize: Size.megabytes(1) });
const photo = notes.image("photo", { extensions: ["png"], maxSize: Size.megabytes(1) });
const sealed = notes.child("sealed", StorageVisibility.Private);
const secret = sealed.file("secret", { extensions: ["png"], maxSize: Size.megabytes(1) });

const PIXEL = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

function png(): File {
  return new File([PIXEL], "a.png", { type: "image/png" });
}

Deno.test("storage e2e: an upload writes the bytes and the row that names them", async () => {
  const uploaded = await note.upload(png(), "o1");
  assert(uploaded.ok, "the upload did not land");

  const served = await fetchObject(STACK.publicBucket, `e2e-${RUN_ID}/o1/note`, { open: true });
  assertEquals(served.status, 200, "the public object did not come back");

  const row = await storageObjects()
    .where((f) => f.path.eq(`e2e-${RUN_ID}/o1/note`))
    .getOne();

  assertEquals(row?.visibility, "public");
  assertEquals(row?.mime_type, "image/png");
  assertEquals(row?.byte_size, PIXEL.byteLength);
  assertEquals(row?.blur_hash, null, "a file resource derived a blur hash it has no use for");

  report("public object served", `${served.body.length} bytes read back`);
  report("index row", `${row?.byte_size} bytes, ${row?.mime_type}`);
});

Deno.test("storage e2e: an image upload carries its blur hash into the index", async () => {
  const uploaded = await photo.upload(png(), "o6");
  assert(uploaded.ok, "the upload did not land");
  assert(uploaded.data.blurHash !== null, "the upload answered no blur hash");

  const row = await storageObjects()
    .where((f) => f.path.eq(`e2e-${RUN_ID}/o6/photo`))
    .getOne();

  assertEquals(row?.blur_hash, uploaded.data.blurHash);
  report("image blur hash", `${row?.blur_hash}`);
});

Deno.test("storage e2e: a folder lists what it holds, out of the index", async () => {
  await note.upload(png(), "o2");
  await secret.upload(png(), "o2");

  const listed = await notes.list("o2");
  assert(listed.ok, "the listing failed");

  assertEquals(listed.data.map((object) => object.path).sort(), [
    `e2e-${RUN_ID}/o2/note`,
    `e2e-${RUN_ID}/o2/sealed/secret`,
  ]);
  assertEquals(
    listed.data.map((object) => object.visibility).sort(),
    [StorageVisibility.Private, StorageVisibility.Public],
  );

  report("listed across both buckets", `${listed.data.length} objects`);
});

Deno.test("storage e2e: clear empties both buckets and the index with them", async () => {
  await note.upload(png(), "o3");
  await secret.upload(png(), "o3");

  const cleared = await notes.clear("o3");
  assert(cleared.ok, "the folder did not clear");

  const listed = await notes.list("o3");
  assertEquals(listed.ok && listed.data, []);

  const gone = await fetchObject(STACK.publicBucket, `e2e-${RUN_ID}/o3/note`, { open: true });
  assertEquals(gone.status, 400, "the public object is still served");

  const sealedGone = await fetchObject(
    STACK.privateBucket,
    `e2e-${RUN_ID}/o3/sealed/secret`,
    { token: STACK.adminKey },
  );
  assertEquals(sealedGone.status, 400, "the private object is still served");
});

Deno.test("storage e2e: a removal takes the bytes and the row together", async () => {
  await note.upload(png(), "o4");

  const removed = await note.remove("o4");
  assert(removed.ok, "the removal failed");

  const row = await storageObjects()
    .where((f) => f.path.eq(`e2e-${RUN_ID}/o4/note`))
    .getOne();

  assertEquals(row, null);
  assertEquals(
    (await fetchObject(STACK.publicBucket, `e2e-${RUN_ID}/o4/note`, { open: true })).status,
    400,
  );
});

Deno.test("storage e2e: a second upload to the same path replaces the object", async () => {
  await note.upload(png(), "o5");
  const again = await note.upload(png(), "o5");
  assert(again.ok, "the second upload did not land");

  const rows = await storageObjects()
    .where((f) => f.path.eq(`e2e-${RUN_ID}/o5/note`))
    .get();

  assertEquals(rows.length, 1, "the index kept two rows for one path");
});
