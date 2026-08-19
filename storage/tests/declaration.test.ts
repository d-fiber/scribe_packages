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
import { assertEquals, assertThrows } from "@std/assert";
import { Size, Storage, StoragePathError, StorageVisibility } from "@scribe/storage/mod.ts";

const SPEC = { extensions: ["png"], maxSize: Size.megabytes(1) };

const people = Storage.public("people/{personId}");
const avatar = people.image("avatar", SPEC);
const badges = people.child("badges/{badgeId}");
const badge = badges.file("badge", { extensions: ["json"], maxSize: Size.kilobytes(4) });

Deno.test("declaration: a resource renders under the folder that declared it", () => {
  assertEquals(
    avatar.url("p1"),
    "http://localhost:4000/storage/v1/object/public/public_bucket/people/p1/avatar",
  );
});

Deno.test("declaration: a child takes the arguments of both templates, in order", () => {
  assertEquals(
    badge.url("p1", "b1"),
    "http://localhost:4000/storage/v1/object/public/public_bucket/people/p1/badges/b1/badge",
  );
});

Deno.test("declaration: a child may land in another bucket than its parent", () => {
  const notes = people.child("notes", StorageVisibility.Private);
  const note = notes.file("note", { extensions: ["json"], maxSize: Size.kilobytes(4) });

  assertEquals(
    note.url("p1"),
    "http://localhost:4001/storage/v1/object/private_bucket/people/p1/notes/note",
  );
});

Deno.test("declaration: an argument carrying a traversal renders no path at all", () => {
  assertEquals(avatar.url("../../etc"), null);
  assertEquals(avatar.url("a/b"), null);
  assertEquals(avatar.url(""), null);
});

Deno.test("declaration: a folder refuses a resource whose name a child already took", () => {
  const shops = Storage.public("shops/{shopId}");
  shops.child("stock/{itemId}");

  assertThrows(() => shops.file("stock", SPEC), TypeError, "stock");
});

Deno.test("declaration: a folder refuses two resources of the same name", () => {
  const cars = Storage.public("cars/{carId}");
  cars.image("photo", SPEC);

  assertThrows(() => cars.image("photo", SPEC), TypeError, "photo");
});

Deno.test("declaration: a child cannot write a placeholder an enclosing folder already writes", () => {
  const teams = Storage.public("teams/{teamId}");

  assertThrows(() => teams.child("sub/{teamId}"), TypeError, "teamId");
});

Deno.test("declaration: the same path cannot be declared for two buckets", () => {
  Storage.public("twice/{id}");

  assertThrows(() => Storage.private("twice/{id}"), TypeError, "twice/{id}");
});

Deno.test("declaration: a template that renders no usable segment is refused", () => {
  assertThrows(() => Storage.public("bad path/{id}"), StoragePathError);
  assertThrows(() => Storage.public(""), StoragePathError);
});
