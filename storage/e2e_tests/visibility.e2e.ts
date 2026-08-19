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

const open = Storage.public(`e2e-open-${RUN_ID}/{ownerId}`);
const openNote = open.file("note", { extensions: ["png"], maxSize: Size.megabytes(1) });

const shut = Storage.private(`e2e-shut-${RUN_ID}/{ownerId}`);
const shutNote = shut.file("note", { extensions: ["png"], maxSize: Size.megabytes(1) });

const PIXEL = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

function png(): File {
  return new File([PIXEL], "a.png", { type: "image/png" });
}

const openPath = `e2e-open-${RUN_ID}/v1/note`;
const shutPath = `e2e-shut-${RUN_ID}/v1/note`;

Deno.test("visibility e2e: the two declarations land in the two buckets", async () => {
  assert((await openNote.upload(png(), "v1")).ok, "the public upload did not land");
  assert((await shutNote.upload(png(), "v1")).ok, "the private upload did not land");

  assertEquals(
    (await fetchObject(STACK.publicBucket, openPath, { open: true })).status,
    200,
    "the public bucket did not answer the open route",
  );
  assertEquals(
    (await fetchObject(STACK.privateBucket, shutPath, { token: STACK.serviceKey })).status,
    200,
    "the private bucket did not answer the service key",
  );
});

Deno.test("visibility e2e: a public object needs no token at all", async () => {
  const served = await fetchObject(STACK.publicBucket, openPath, { open: true });

  assertEquals(served.status, 200);
  report("public object, no token", `${served.status}`);
});

Deno.test("visibility e2e: a private object answers nothing to an address alone", async () => {
  const served = await fetchObject(STACK.privateBucket, shutPath);

  assert(served.status >= 400, `the private object came back with ${served.status}`);
  report("private object, no token", `${served.status}`);
});

Deno.test("visibility e2e: the private policy reads the admin role out of the token", async () => {
  const asAdmin = await fetchObject(STACK.privateBucket, shutPath, { token: STACK.adminKey });
  const asUser = await fetchObject(STACK.privateBucket, shutPath, { token: STACK.userKey });

  assertEquals(asAdmin.status, 200, "an admin token did not open the private bucket");
  assert(asUser.status >= 400, `a plain session read the private bucket with ${asUser.status}`);

  report("private object, admin token", `${asAdmin.status}`);
  report("private object, plain session", `${asUser.status}`);
});

Deno.test("visibility e2e: the open route serves nothing out of the private bucket", async () => {
  const served = await fetchObject(STACK.privateBucket, shutPath, { open: true });

  assert(served.status >= 400, `the open route served the private bucket with ${served.status}`);
});

Deno.test("visibility e2e: a public url is the one the declaration builds", () => {
  assertEquals(
    openNote.url("v1"),
    `${STACK.appUrl}/storage/v1/object/public/${STACK.publicBucket}/${openPath}`,
  );
  assertEquals(
    shutNote.url("v1"),
    `${STACK.adminUrl}/storage/v1/object/${STACK.privateBucket}/${shutPath}`,
  );
  assertEquals(StorageVisibility.Private, "private");
});
