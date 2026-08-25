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

import { installStorageTestSettings } from "../testing/settings.ts";

installStorageTestSettings();
import { assertEquals, assertThrows } from "@std/assert";
import { Bytes, Storage, StoragePathError, StorageVisibility } from "@scribe/storage";

const SPEC = { extensions: ["png"], maxSize: Bytes.megabytes(1) };

const people = Storage.public("people/{personId}");
const avatar = people.image("avatar", SPEC);
const badges = people.child("badges/{badgeId}");
const badge = badges.file("badge", { extensions: ["json"], maxSize: Bytes.kilobytes(4) });

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
  const note = notes.file("note", { extensions: ["json"], maxSize: Bytes.kilobytes(4) });

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
