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
import { compileDocument, readDocument } from "../../lib/src/document/projection.ts";
import type { DocumentSelector } from "../../lib/src/document/selector.ts";
import { documentSelector } from "../../lib/src/document/selector.ts";
import { DEFAULT_SETTINGS, Field, SORT_NORMALIZER } from "@scribe/search";

interface StoreRow {
  store_id: string;
  name: string;
  headline: string;
  is_open: boolean;
  opened_at: number;
  location: { lat: number; lng: number };
}

interface BrandRow {
  brand_id: string;
  store_id: string;
  label: string;
}

const s = documentSelector<StoreRow>();

Deno.test("the select list carries the key first and aliases every field to its own name", () => {
  const compiled = compileDocument("stores", "store_id", {
    name: Field.text(s.name),
    tagline: Field.text(s.headline),
    open: Field.bool(s.is_open),
  });

  assertEquals(compiled.columns, "store_id, name, tagline:headline, open:is_open");
});

Deno.test("the mapping names one entry per declared field, under the field name", () => {
  const compiled = compileDocument("stores", "store_id", {
    name: Field.text(s.name),
    open: Field.bool(s.is_open),
    opened_at: Field.timestamp(s.opened_at),
    location: Field.geo(s.location),
  });

  assertEquals(compiled.mappings.open, { type: "boolean" });
  assertEquals(compiled.mappings.opened_at, { type: "long" });
  assertEquals(compiled.mappings.location, { type: "geo_point" });
});

Deno.test("a sortable text field carries the folded keyword a sort compares beside it", () => {
  const compiled = compileDocument("stores", "store_id", {
    name: Field.text(s.name, { sortable: true }),
  });

  assertEquals(compiled.mappings.name, {
    type: "text",
    fields: { keyword: { type: "keyword", normalizer: SORT_NORMALIZER } },
  });
});

Deno.test("the normalizer a sortable field names is the one the default analysis declares", () => {
  assertEquals(Object.keys(DEFAULT_SETTINGS.analysis?.normalizer ?? {}), [SORT_NORMALIZER]);
});

Deno.test("the text fields a free-text query looks in come out of the declaration with their weights", () => {
  const compiled = compileDocument("stores", "store_id", {
    name: Field.text(s.name, { boost: 3 }),
    tagline: Field.text(s.headline),
    open: Field.bool(s.is_open),
  });

  assertEquals(compiled.textFields, [
    { path: "name", boost: 3 },
    { path: "tagline", boost: null },
  ]);
});

Deno.test("a folded relation reads as a sub-select and its text fields are dotted", () => {
  const compiled = compileDocument("stores", "store_id", {
    name: Field.text(s.name),
    brand: s.embed("brands", (b: DocumentSelector<BrandRow>) => ({ label: Field.text(b.label) })),
  });

  assertEquals(compiled.columns, "store_id, name, brand:brands(label)");
  assertEquals(compiled.textFields, [
    { path: "name", boost: null },
    { path: "brand.label", boost: null },
  ]);
});

Deno.test("a relation folded as nested is mapped as nested, and as an object otherwise", () => {
  const flat = compileDocument("stores", "store_id", {
    brand: s.embed("brands", (b: DocumentSelector<BrandRow>) => ({ label: Field.text(b.label) })),
  });
  const nested = compileDocument("stores", "store_id", {
    brands: s.embed(
      "brands",
      (b: DocumentSelector<BrandRow>) => ({ label: Field.text(b.label) }),
      { nested: true },
    ),
  });

  assertEquals((flat.mappings.brand as { type: string }).type, "object");
  assertEquals((nested.mappings.brands as { type: string }).type, "nested");
});

Deno.test("a relation declared inner is selected as inner, so a document with no row is dropped", () => {
  const compiled = compileDocument("stores", "store_id", {
    brand: s.embed(
      "brands",
      (b: DocumentSelector<BrandRow>) => ({ label: Field.text(b.label) }),
      { inner: true },
    ),
  });

  assertEquals(compiled.columns, "store_id, brand:brands!inner(label)");
});

Deno.test("a read row lands under the declared field names, whatever column it came from", () => {
  const compiled = compileDocument("stores", "store_id", {
    name: Field.text(s.name),
    open: Field.bool(s.is_open),
  });

  assertEquals(readDocument(compiled.shape, { store_id: "a", name: "Chez Rosa", open: true }), {
    name: "Chez Rosa",
    open: true,
  });
});

Deno.test("a relation answering one row is unwrapped, and a nested one keeps its list", () => {
  const one = compileDocument("stores", "store_id", {
    brand: s.embed("brands", (b: DocumentSelector<BrandRow>) => ({ label: Field.text(b.label) })),
  });
  const many = compileDocument("stores", "store_id", {
    brands: s.embed(
      "brands",
      (b: DocumentSelector<BrandRow>) => ({ label: Field.text(b.label) }),
      { nested: true },
    ),
  });

  assertEquals(readDocument(one.shape, { brand: [{ label: "Rosa" }] }), { brand: { label: "Rosa" } });
  assertEquals(readDocument(many.shape, { brands: [{ label: "Rosa" }, { label: "Lino" }] }), {
    brands: [{ label: "Rosa" }, { label: "Lino" }],
  });
});

Deno.test("a geo column is read under the spelling the cluster wants, from either of the two", () => {
  const compiled = compileDocument("stores", "store_id", { location: Field.geo(s.location) });

  assertEquals(readDocument(compiled.shape, { location: { lat: 48.85, lng: 2.35 } }), {
    location: { lat: 48.85, lon: 2.35 },
  });
});
