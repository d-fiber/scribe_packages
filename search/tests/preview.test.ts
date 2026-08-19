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

import { assertEquals } from "@std/assert";
import { compilePreview } from "@scribe/search/src/document/preview.ts";
import type { PreviewSelector } from "@scribe/search/src/document/selector.ts";
import { previewSelector } from "@scribe/search/src/document/selector.ts";

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
