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
import type { SearchParams } from "../../lib/contracts/definition.ts";
import type { DocumentSelector } from "../../lib/src/document/selector.ts";
import { Field, indexNamed, Search } from "@scribe/search";

interface StoreRow {
  store_id: string;
  name: string;
  is_open: boolean;
}

interface BrandRow {
  brand_id: string;
  store_id: string;
  label: string;
}

interface LineRow {
  line_id: string;
  label: string;
}

interface StoreSearch extends SearchParams {
  text?: string;
}

function declare(table: string, options?: { name?: string; index?: string }) {
  return Search.on<StoreRow>(table, "store_id", options)
    .document((s) => ({ name: Field.text(s.name), open: Field.bool(s.is_open) }))
    .preview((s) => ({ id: s.store_id, name: s.name }))
    .query((params: StoreSearch, { q }) => q.text(params.text));
}

Scribe.test("an index that names neither takes its table as name and as cluster index", () => {
  const declared = declare("plain_stores");

  expect(declared.name, equals("plain_stores"));
  expect(indexNamed("plain_stores")?.index, equals("plain_stores"));
});

Scribe.test("a named index is found under its name and not under its table", () => {
  declare("named_stores", { name: "named_by_hand" });

  expect(indexNamed("named_by_hand")?.table, equals("named_stores"));
  expect(indexNamed("named_stores"), equals(null));
});

Scribe.test("an index rebuilt under a second cluster index keeps the name callers use", () => {
  declare("rebuilt_stores", { name: "rebuilt", index: "rebuilt_v2" });

  expect(indexNamed("rebuilt")?.index, equals("rebuilt_v2"));
});

Scribe.test("the tables feeding an index are the declared one and every relation folded in", () => {
  Search.on<StoreRow>("sourced_stores", "store_id")
    .document((s) => ({
      name: Field.text(s.name),
      brands: s.embed("brands", (b: DocumentSelector<BrandRow>) => ({ label: Field.text(b.label) })),
    }))
    .preview((s) => ({ id: s.store_id }))
    .query((params: StoreSearch, { q }) => q.text(params.text));

  expect(
    indexNamed("sourced_stores")?.sources,
    equals([
      { table: "sourced_stores", key: "store_id" },
      { table: "brands", key: "store_id" },
    ]),
  );
});

Scribe.test("a relation folded two levels deep with no key of its own is refused", () => {
  expect(
    () =>
      Search.on<StoreRow>("deep_stores", "store_id")
        .document((s) => ({
          brands: s.embed("brands", (b: DocumentSelector<BrandRow>) => ({
            lines: b.embed("lines", (l: DocumentSelector<LineRow>) => ({ label: Field.text(l.label) })),
          })),
        }))
        .preview((s) => ({ id: s.store_id }))
        .query((params: StoreSearch, { q }) => q.text(params.text)),
    throwsA(allOf(isA(TypeError), withMessage("is folded 2 levels deep and names no key"))),
  );
});

Scribe.test("a relation folded two levels deep that names its key is accepted", () => {
  Search.on<StoreRow>("keyed_deep_stores", "store_id")
    .document((s) => ({
      brands: s.embed("brands", (b: DocumentSelector<BrandRow>) => ({
        lines: b.embed(
          "lines",
          (l: DocumentSelector<LineRow>) => ({ label: Field.text(l.label) }),
          { key: "store_id" },
        ),
      })),
    }))
    .preview((s) => ({ id: s.store_id }))
    .query((params: StoreSearch, { q }) => q.text(params.text));

  expect(
    indexNamed("keyed_deep_stores")?.sources,
    equals([
      { table: "keyed_deep_stores", key: "store_id" },
      { table: "brands", key: "store_id" },
      { table: "lines", key: "store_id" },
    ]),
  );
});

Scribe.test("two declarations under the same name are refused", () => {
  declare("twice_first", { name: "declared_twice" });

  expect(
    () => declare("twice_second", { name: "declared_twice" }),
    throwsA(allOf(isA(TypeError), withMessage('is declared twice, on "twice_first" and on "twice_second"'))),
  );
});

Scribe.test("two declarations writing into the same cluster index are refused", () => {
  declare("shared_first", { name: "shared_one", index: "shared_index" });

  expect(
    () => declare("shared_second", { name: "shared_two", index: "shared_index" }),
    throwsA(allOf(isA(TypeError), withMessage('both write into "shared_index"'))),
  );
});

Scribe.test("the same declaration walked twice under one name is accepted", () => {
  const declared = declare("idempotent_stores", { name: "idempotent" });

  expect(indexNamed("idempotent")?.name, equals(declared.name));
});
