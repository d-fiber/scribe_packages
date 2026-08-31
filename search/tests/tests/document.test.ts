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
import { equals, expect, Scribe } from "@scribe/alchemy/test";
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

Scribe.test("the select list carries the key first and aliases every field to its own name", () => {
  const compiled = compileDocument("stores", "store_id", {
    name: Field.text(s.name),
    tagline: Field.text(s.headline),
    open: Field.bool(s.is_open),
  });

  expect(compiled.columns, equals("store_id, name, tagline:headline, open:is_open"));
});

Scribe.test("the mapping names one entry per declared field, under the field name", () => {
  const compiled = compileDocument("stores", "store_id", {
    name: Field.text(s.name),
    open: Field.bool(s.is_open),
    opened_at: Field.timestamp(s.opened_at),
    location: Field.geo(s.location),
  });

  expect(compiled.mappings.open, equals({ type: "boolean" }));
  expect(compiled.mappings.opened_at, equals({ type: "long" }));
  expect(compiled.mappings.location, equals({ type: "geo_point" }));
});

Scribe.test("a sortable text field carries the folded keyword a sort compares beside it", () => {
  const compiled = compileDocument("stores", "store_id", {
    name: Field.text(s.name, { sortable: true }),
  });

  expect(
    compiled.mappings.name,
    equals({
      type: "text",
      fields: { keyword: { type: "keyword", normalizer: SORT_NORMALIZER } },
    }),
  );
});

Scribe.test("the normalizer a sortable field names is the one the default analysis declares", () => {
  expect(Object.keys(DEFAULT_SETTINGS.analysis?.normalizer ?? {}), equals([SORT_NORMALIZER]));
});

Scribe.test("the text fields a free-text query looks in come out of the declaration with their weights", () => {
  const compiled = compileDocument("stores", "store_id", {
    name: Field.text(s.name, { boost: 3 }),
    tagline: Field.text(s.headline),
    open: Field.bool(s.is_open),
  });

  expect(
    compiled.textFields,
    equals([
      { path: "name", boost: 3 },
      { path: "tagline", boost: null },
    ]),
  );
});

Scribe.test("a folded relation reads as a sub-select and its text fields are dotted", () => {
  const compiled = compileDocument("stores", "store_id", {
    name: Field.text(s.name),
    brand: s.embed("brands", (b: DocumentSelector<BrandRow>) => ({ label: Field.text(b.label) })),
  });

  expect(compiled.columns, equals("store_id, name, brand:brands(label)"));
  expect(
    compiled.textFields,
    equals([
      { path: "name", boost: null },
      { path: "brand.label", boost: null },
    ]),
  );
});

Scribe.test("a relation folded as nested is mapped as nested, and as an object otherwise", () => {
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

  expect((flat.mappings.brand as { type: string }).type, equals("object"));
  expect((nested.mappings.brands as { type: string }).type, equals("nested"));
});

Scribe.test("a relation declared inner is selected as inner, so a document with no row is dropped", () => {
  const compiled = compileDocument("stores", "store_id", {
    brand: s.embed(
      "brands",
      (b: DocumentSelector<BrandRow>) => ({ label: Field.text(b.label) }),
      { inner: true },
    ),
  });

  expect(compiled.columns, equals("store_id, brand:brands!inner(label)"));
});

Scribe.test("a read row lands under the declared field names, whatever column it came from", () => {
  const compiled = compileDocument("stores", "store_id", {
    name: Field.text(s.name),
    open: Field.bool(s.is_open),
  });

  expect(
    readDocument(compiled.shape, { store_id: "a", name: "Chez Rosa", open: true }),
    equals({
      name: "Chez Rosa",
      open: true,
    }),
  );
});

Scribe.test("a relation answering one row is unwrapped, and a nested one keeps its list", () => {
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

  expect(readDocument(one.shape, { brand: [{ label: "Rosa" }] }), equals({ brand: { label: "Rosa" } }));
  expect(
    readDocument(many.shape, { brands: [{ label: "Rosa" }, { label: "Lino" }] }),
    equals({
      brands: [{ label: "Rosa" }, { label: "Lino" }],
    }),
  );
});

Scribe.test("a geo column is read under the spelling the cluster wants, from either of the two", () => {
  const compiled = compileDocument("stores", "store_id", { location: Field.geo(s.location) });

  expect(
    readDocument(compiled.shape, { location: { lat: 48.85, lng: 2.35 } }),
    equals({
      location: { lat: 48.85, lon: 2.35 },
    }),
  );
});
