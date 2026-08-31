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

import "@scribe/runtime/scholium/runner.ts";
import { allOf, equals, expect, isA, Scribe, throwsA, withMessage } from "@scribe/alchemy/test";
import { installStorageTestSettings } from "../testing/settings.ts";

installStorageTestSettings();
import { Bytes, Storage, StoragePathError, StorageVisibility } from "@scribe/storage";

const SPEC = { extensions: ["png"], maxSize: Bytes.megabytes(1) };

const people = Storage.public("people/{personId}");
const avatar = people.image("avatar", SPEC);
const badges = people.child("badges/{badgeId}");
const badge = badges.file("badge", { extensions: ["json"], maxSize: Bytes.kilobytes(4) });

Scribe.test("declaration: a resource renders under the folder that declared it", () => {
  expect(avatar.url("p1"), equals("http://localhost:4000/storage/v1/object/public/public_bucket/people/p1/avatar"));
});

Scribe.test("declaration: a child takes the arguments of both templates, in order", () => {
  expect(
    badge.url("p1", "b1"),
    equals("http://localhost:4000/storage/v1/object/public/public_bucket/people/p1/badges/b1/badge"),
  );
});

Scribe.test("declaration: a child may land in another bucket than its parent", () => {
  const notes = people.child("notes", StorageVisibility.Private);
  const note = notes.file("note", { extensions: ["json"], maxSize: Bytes.kilobytes(4) });

  expect(note.url("p1"), equals("http://localhost:4001/storage/v1/object/private_bucket/people/p1/notes/note"));
});

Scribe.test("declaration: an argument carrying a traversal renders no path at all", () => {
  expect(avatar.url("../../etc"), equals(null));
  expect(avatar.url("a/b"), equals(null));
  expect(avatar.url(""), equals(null));
});

Scribe.test("declaration: a folder refuses a resource whose name a child already took", () => {
  const shops = Storage.public("shops/{shopId}");
  shops.child("stock/{itemId}");

  expect(() => shops.file("stock", SPEC), throwsA(allOf(isA(TypeError), withMessage("stock"))));
});

Scribe.test("declaration: a folder refuses two resources of the same name", () => {
  const cars = Storage.public("cars/{carId}");
  cars.image("photo", SPEC);

  expect(() => cars.image("photo", SPEC), throwsA(allOf(isA(TypeError), withMessage("photo"))));
});

Scribe.test("declaration: a child cannot write a placeholder an enclosing folder already writes", () => {
  const teams = Storage.public("teams/{teamId}");

  expect(() => teams.child("sub/{teamId}"), throwsA(allOf(isA(TypeError), withMessage("teamId"))));
});

Scribe.test("declaration: the same path cannot be declared for two buckets", () => {
  Storage.public("twice/{id}");

  expect(() => Storage.private("twice/{id}"), throwsA(allOf(isA(TypeError), withMessage("twice/{id}"))));
});

Scribe.test("declaration: a template that renders no usable segment is refused", () => {
  expect(() => Storage.public("bad path/{id}"), throwsA(isA(StoragePathError)));
  expect(() => Storage.public(""), throwsA(isA(StoragePathError)));
});
