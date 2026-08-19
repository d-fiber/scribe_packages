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

import { assertEquals, assertThrows } from "@std/assert";
import type { SearchParams } from "@scribe/search/contracts/definition.ts";
import type { DocumentSelector } from "@scribe/search/src/document/selector.ts";
import { Field, indexNamed, Search } from "@scribe/search/mod.ts";

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

Deno.test("an index that names neither takes its table as name and as cluster index", () => {
  const declared = declare("plain_stores");

  assertEquals(declared.name, "plain_stores");
  assertEquals(indexNamed("plain_stores")?.index, "plain_stores");
});

Deno.test("a named index is found under its name and not under its table", () => {
  declare("named_stores", { name: "named_by_hand" });

  assertEquals(indexNamed("named_by_hand")?.table, "named_stores");
  assertEquals(indexNamed("named_stores"), null);
});

Deno.test("an index rebuilt under a second cluster index keeps the name callers use", () => {
  declare("rebuilt_stores", { name: "rebuilt", index: "rebuilt_v2" });

  assertEquals(indexNamed("rebuilt")?.index, "rebuilt_v2");
});

Deno.test("the tables feeding an index are the declared one and every relation folded in", () => {
  Search.on<StoreRow>("sourced_stores", "store_id")
    .document((s) => ({
      name: Field.text(s.name),
      brands: s.embed("brands", (b: DocumentSelector<BrandRow>) => ({ label: Field.text(b.label) })),
    }))
    .preview((s) => ({ id: s.store_id }))
    .query((params: StoreSearch, { q }) => q.text(params.text));

  assertEquals(indexNamed("sourced_stores")?.sources, [
    { table: "sourced_stores", key: "store_id" },
    { table: "brands", key: "store_id" },
  ]);
});

Deno.test("a relation folded two levels deep with no key of its own is refused", () => {
  assertThrows(
    () =>
      Search.on<StoreRow>("deep_stores", "store_id")
        .document((s) => ({
          brands: s.embed("brands", (b: DocumentSelector<BrandRow>) => ({
            lines: b.embed("lines", (l: DocumentSelector<LineRow>) => ({ label: Field.text(l.label) })),
          })),
        }))
        .preview((s) => ({ id: s.store_id }))
        .query((params: StoreSearch, { q }) => q.text(params.text)),
    TypeError,
    "is folded 2 levels deep and names no key",
  );
});

Deno.test("a relation folded two levels deep that names its key is accepted", () => {
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

  assertEquals(indexNamed("keyed_deep_stores")?.sources, [
    { table: "keyed_deep_stores", key: "store_id" },
    { table: "brands", key: "store_id" },
    { table: "lines", key: "store_id" },
  ]);
});

Deno.test("two declarations under the same name are refused", () => {
  declare("twice_first", { name: "declared_twice" });

  assertThrows(
    () => declare("twice_second", { name: "declared_twice" }),
    TypeError,
    'is declared twice, on "twice_first" and on "twice_second"',
  );
});

Deno.test("two declarations writing into the same cluster index are refused", () => {
  declare("shared_first", { name: "shared_one", index: "shared_index" });

  assertThrows(
    () => declare("shared_second", { name: "shared_two", index: "shared_index" }),
    TypeError,
    'both write into "shared_index"',
  );
});

Deno.test("the same declaration walked twice under one name is accepted", () => {
  const declared = declare("idempotent_stores", { name: "idempotent" });

  assertEquals(indexNamed("idempotent")?.name, declared.name);
});
