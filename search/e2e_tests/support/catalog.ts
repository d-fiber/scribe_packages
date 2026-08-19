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

import type { SearchParams } from "@scribe/search/contracts/definition.ts";
import { SortOrder } from "@scribe/search/contracts/query.ts";
import { Field, Search } from "@scribe/search/mod.ts";
import type { DocumentSelector, PreviewSelector } from "@scribe/search/src/document/selector.ts";

/** One row of `e2e_brands`, the table the document folds in to carry a label. */
export interface BrandRow {
  /** The brand, as `e2e_stores.brand_id` points at it. */
  brand_id: string;

  /** What the brand is called, which a free-text query looks in. */
  label: string;
}

/** One row of `e2e_store_tags`, the table that names a store several times over. */
export interface TagRow {
  /** The tag row itself, which no document ever names. */
  tag_id: string;

  /** The store the tag belongs to, which is what the trigger reads to name the document. */
  store_id: string;

  /** The tag, kept whole rather than cut into terms. */
  tag: string;
}

/** One row of `e2e_stores`, the table the index is declared on. */
export interface StoreRow {
  /** The store, which is the identifier of one document. */
  store_id: string;

  /** The name a free-text query looks in first, and the name a page is sorted by. */
  name: string;

  /** Where the store stands, matched whole. */
  status: string;

  /** What the store weighs against the others of a page. */
  rank: number;

  /** Whether the store takes orders right now. */
  is_open: boolean;

  /** The brand the store belongs to, absent for a store that belongs to none. */
  brand_id: string | null;

  /** When the row was written. */
  created_at: string;
}

/** What a caller of {@link stores} may ask for. */
export interface StoreSearch extends SearchParams {
  /** The words to look for, absent for a page that matches everything. */
  text?: string;

  /** Whether to keep only the stores that are open, absent for both. */
  open?: boolean;

  /** A tag every answered store must carry, absent for no such condition. */
  tag?: string;

  /** Which of the two declared sorts to rank the page by. The name when absent. */
  sort?: "name" | "rank";
}

/**
 * The index the suite declares, over the tables `db/init/01_catalog.sql` creates.
 *
 * @remarks
 * It stands where a project's own declaration stands, which is what makes the run end to end:
 * the trigger the SQL attaches names this index, the drain looks it up by that name, and the
 * mapping the cluster is created with is the one these fields compile to.
 */
export const stores = Search.on<StoreRow>("e2e_stores", "store_id", { pageSize: 5 })
  .document((s) => ({
    name: Field.text(s.name, { boost: 3, sortable: true }),
    status: Field.keyword(s.status),
    rank: Field.integer(s.rank),
    open: Field.bool(s.is_open),
    brand: s.embed("e2e_brands", (b: DocumentSelector<BrandRow>) => ({ label: Field.text(b.label) })),
    tags: s.embed(
      "e2e_store_tags",
      (t: DocumentSelector<TagRow>) => ({ tag: Field.keyword(t.tag) }),
      { nested: true, key: "store_id" },
    ),
  }))
  .preview((s) => ({
    store_id: s.store_id,
    name: s.name,
    status: s.status,
    brand: s.embed("e2e_brands", (b: PreviewSelector<BrandRow>) => ({ label: b.label })),
  }))
  .sorts((f) => ({
    name: f.keyword("name", SortOrder.Asc),
    rank: f.sort("rank", SortOrder.Desc),
  }))
  .query((params: StoreSearch, { q, f, sorts }) =>
    q.text(params.text)
      .filter(params.open !== undefined && { term: { [f.field("open")]: params.open } })
      .filter(params.tag !== undefined && f.nested("tags", { term: { "tags.tag": params.tag } }))
      .sort(params.sort === "rank" ? sorts.rank : sorts.name)
  );
