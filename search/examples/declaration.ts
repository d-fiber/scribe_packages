import { Field, Search } from "@scribe/search";
import type { SearchParams } from "@scribe/search/lib/contracts/definition.ts";
import { SortOrder } from "@scribe/search/lib/contracts/query.ts";
import type { DocumentSelector } from "@scribe/search/lib/src/document/selector.ts";

/** One row of the stores table. */
export interface StoreRow {
  /** The primary key, named as the column identifying one document. */
  store_id: string;

  /** The name customers look for. */
  name: string;

  /** Where the store stands: `open`, `closed` or `pending`. */
  status: string;

  /** Whether it is serving right now. */
  is_open: boolean;

  /** Where it is, as the cluster reads a point. */
  location: { lat: number; lon: number };

  /** When the row was written, in milliseconds since the epoch. */
  created_at: number;
}

/** One row of the brands table, folded into the store document. */
export interface BrandRow {
  /** What the brand is called. */
  label: string;
}

/** What a caller may narrow a store search with. */
export interface StoreSearch extends SearchParams {
  /** The words to look for, across every analysed field of the document. */
  text?: string;

  /** Whether to keep only the stores serving right now. */
  open?: boolean;
}

/**
 * An index is built, not extended: there is nothing to subclass and nothing to override.
 *
 * What the project writes is which columns the index holds, what one result looks like, and
 * how the parameters narrow the search. The select lists, the mapping, the tables whose
 * changes rebuild a document and the fields a free-text query looks in all come out of the
 * document declaration, so none of them can drift from it.
 *
 * Nothing here reaches the cluster or the database. Declaring costs nothing until something
 * is searched.
 */
export const stores = Search.on<StoreRow>("stores", "store_id")
  .document((s) => ({
    name: Field.text(s.name, { boost: 3, sortable: true }),
    status: Field.keyword(s.status),
    open: Field.bool(s.is_open),
    location: Field.geo(s.location),
    created: Field.timestamp(s.created_at),
    brand: s.embed("brands", (b: DocumentSelector<BrandRow>) => ({ label: Field.text(b.label) })),
  }))
  .preview((s) => ({ id: s.store_id, name: s.name }))
  .sorts((f) => ({
    newest: f.sort("created", SortOrder.Desc),
    name: f.keyword("name", SortOrder.Asc),
  }))
  .query((params: StoreSearch, { q, f, sorts }) =>
    q.text(params.text)
      .filter(params.open !== undefined && { term: { [f.field("open")]: params.open } })
      .sort(sorts.newest)
  );
