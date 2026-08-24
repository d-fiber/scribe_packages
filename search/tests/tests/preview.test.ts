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

import { assertEquals } from "@std/assert";
import { compilePreview } from "@scribe/search/lib/src/document/preview.ts";
import type { PreviewSelector } from "@scribe/search/lib/src/document/selector.ts";
import { previewSelector } from "@scribe/search/lib/src/document/selector.ts";

interface StoreRow {
  store_id: string;
  name: string;
  headline: string;
  cover_url: string;
}

interface BrandRow {
  brand_id: string;
  label: string;
}

const s = previewSelector<StoreRow>();

Deno.test("a flat preview selects its columns with the key in front", () => {
  const compiled = compilePreview({ id: s.store_id, name: s.name }, ["store_id"]);

  assertEquals(compiled.columns, "store_id, id:store_id, name");
});

Deno.test("a grouped preview aliases each leaf to the path that leads to it", () => {
  const compiled = compilePreview({
    name: s.name,
    cover: { url: s.cover_url, caption: s.headline },
  }, ["store_id"]);

  assertEquals(compiled.columns, "store_id, name, cover__url:cover_url, cover__caption:headline");
});

Deno.test("a grouped preview puts every answered column back where the declaration wrote it", () => {
  const compiled = compilePreview({
    name: s.name,
    cover: { url: s.cover_url, caption: s.headline },
  }, ["store_id"]);

  assertEquals(
    compiled.build({ store_id: "a", name: "Chez Rosa", cover__url: "u", cover__caption: "c" }),
    { name: "Chez Rosa", cover: { url: "u", caption: "c" } },
  );
});

Deno.test("a leaf the row does not carry reads as nothing rather than as undefined", () => {
  const compiled = compilePreview({ name: s.name, tagline: s.headline }, ["store_id"]);

  assertEquals(compiled.build({ store_id: "a", name: "Chez Rosa" }), {
    name: "Chez Rosa",
    tagline: null,
  });
});

Deno.test("a folded relation reads as a sub-select under the name the preview gave it", () => {
  const compiled = compilePreview({
    name: s.name,
    brand: s.embed("brands", (b: PreviewSelector<BrandRow>) => ({ label: b.label })),
  }, ["store_id"]);

  assertEquals(compiled.columns, "store_id, name, brand:brands(label)");
});

Deno.test("a relation answering one row builds an object, and nothing when it answered none", () => {
  const compiled = compilePreview({
    brand: s.embed("brands", (b: PreviewSelector<BrandRow>) => ({ label: b.label })),
  }, ["store_id"]);

  assertEquals(compiled.build({ brand: [{ label: "Rosa" }] }), { brand: { label: "Rosa" } });
  assertEquals(compiled.build({}), { brand: null });
});

Deno.test("a relation declared many builds a list, empty when it answered none", () => {
  const compiled = compilePreview({
    brands: s.embed("brands", (b: PreviewSelector<BrandRow>) => ({ label: b.label }), { many: true }),
  }, ["store_id"]);

  assertEquals(compiled.build({ brands: [{ label: "Rosa" }, { label: "Lino" }] }), {
    brands: [{ label: "Rosa" }, { label: "Lino" }],
  });
  assertEquals(compiled.build({}), { brands: [] });
});

Deno.test("two branches reading the same column each keep their own alias", () => {
  const compiled = compilePreview({
    header: { title: s.name },
    card: { title: s.name },
  }, ["store_id"]);

  assertEquals(compiled.columns, "store_id, header__title:name, card__title:name");
  assertEquals(compiled.build({ header__title: "a", card__title: "a" }), {
    header: { title: "a" },
    card: { title: "a" },
  });
});
