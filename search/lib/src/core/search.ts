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

import type { Duration } from "@scribe/alchemy";
import type { IndexSettings, QueryPlan, Search as SearchHandle, SearchParams } from "../../contracts/definition.ts";
import type { SearchSort } from "../../contracts/query.ts";
import { compilePreview } from "../document/preview.ts";
import { compileDocument } from "../document/projection.ts";
import {
  type DocumentSelector,
  documentSelector,
  type PreviewOf,
  type PreviewSelector,
  previewSelector,
  type PreviewShape,
} from "../document/selector.ts";
import { DEFAULT_SETTINGS, type DocumentShape, type EmbeddedField, type MappedField } from "../fields/mapping.ts";
import { type DocumentProperties, type QueryFields, queryFields } from "../fields/projection.ts";
import { QueryBuilder } from "../fields/query.ts";
import { DEFAULT_TTL } from "./cache.ts";
import { declareIndex } from "./registry.ts";
import { SearchIndex } from "./search_index.ts";

/** How many results a page holds when neither the declaration nor the caller says. */
const DEFAULT_PAGE_SIZE = 20;

/** What a project holds once it has declared an index. */
export type Search<TParams extends SearchParams, TPreview> = SearchHandle<TParams, TPreview>;

/**
 * What a document declaration turns into once a query has to be checked against it.
 *
 * A leaf carries the mapping its field writes, and a folded relation carries the mapping of
 * every field it brings under the kind the cluster reads it as. It is the same walk
 * `compileDocument` does at runtime, done in the type system so that a sort on analysed text
 * or a nested clause on a plain object does not compile.
 */
export type PropertiesOf<S extends DocumentShape> = {
  [K in keyof S]: S[K] extends MappedField<infer M> ? M
    : S[K] extends EmbeddedField<infer Sub, infer N>
      ? Sub extends DocumentShape ? { type: N extends true ? "nested" : "object"; properties: PropertiesOf<Sub> }
      : never
    : never;
};

/** The sorts a declaration names, so a query picks one by name rather than writing it again. */
export type DeclaredSorts = Record<string, SearchSort | readonly SearchSort[]>;

/** What a declaration's query is handed besides the parameters it was called with. */
export interface QueryContext<P extends DocumentProperties, S extends DeclaredSorts> {
  /** A builder whose text clause already knows the analysed fields and what each one weighs. */
  readonly q: QueryBuilder;

  /** The field names of this declaration, which refuse the ones the document does not hold. */
  readonly f: QueryFields<P>;

  /** The sorts this declaration named. */
  readonly sorts: S;
}

/** What declaring an index takes beyond the table and the column identifying one document. */
export interface IndexOptions {
  /**
   * The name this index is declared under, which is what the outbox and a trigger address.
   *
   * The table when absent, which is what a project wants until it indexes one table twice.
   */
  readonly name?: string;

  /**
   * The index in the cluster this declaration writes into.
   *
   * The declared name when absent. Naming it is what makes a rebuild possible: a field that
   * changes type cannot be written onto a live index, so the new shape is declared under a
   * second index name, filled from the outbox, and the declaration keeps its own name
   * throughout, which leaves every caller alone.
   */
  readonly index?: string;

  /** How many results a page holds when the caller asks for no size. Twenty when absent. */
  readonly pageSize?: number;

  /** How long a page and a preview are kept. Five minutes when absent. */
  readonly ttl?: Duration;

  /** The analysis the index is created with. Lowercased and accent-folded when absent. */
  readonly settings?: IndexSettings;
}

/** The step that says what the index holds, which every other step is derived from. */
export interface DocumentStep<TRow extends object> {
  /**
   * Declares the fields of the document, each one naming the column it reads.
   *
   * ```ts
   * .document((s) => ({
   *   name: Field.text(s.name, { boost: 3, sortable: true }),
   *   status: Field.keyword(s.status),
   *   brand: s.embed("brands", (b: DocumentSelector<BrandRow>) => ({ label: Field.text(b.label) })),
   * }))
   * ```
   */
  document<const S extends DocumentShape>(
    builder: (s: DocumentSelector<TRow>) => S,
  ): PreviewStep<TRow, PropertiesOf<S>>;
}

/** The step that says what a search answers with. */
export interface PreviewStep<TRow extends object, P extends DocumentProperties> {
  /**
   * Declares what one result looks like, which is also the type `search` answers.
   *
   * The shape is read as a projection over the table: a string is a column, a nested object
   * groups columns, and `s.embed` folds a relation in. Nothing has to be written twice, and
   * nothing has to be named: the type of one result is what this shape says it is.
   */
  preview<const S extends PreviewShape>(
    builder: (s: PreviewSelector<TRow>) => S,
  ): QueryStep<P, PreviewOf<TRow, S>, Record<never, never>>;
}

/** The last step: the sorts a query may pick, and the query itself. */
export interface QueryStep<P extends DocumentProperties, TPreview, S extends DeclaredSorts> {
  /**
   * Names the sorts a query may pick, so a caller's `sort` parameter maps onto one of them.
   *
   * ```ts
   * .sorts((f) => ({ newest: f.sort("created_at", SortOrder.Desc), name: f.keyword("name", SortOrder.Asc) }))
   * ```
   */
  sorts<const NS extends DeclaredSorts>(builder: (f: QueryFields<P>) => NS): QueryStep<P, TPreview, NS>;

  /**
   * Compiles one set of parameters into a plan, and hands back the declared index.
   *
   * `TParams` is read from the type the callback annotates its first argument with, and it is
   * the whole surface a caller of `search` sees. Declaring is what registers the index, so
   * this is the last step and there is nothing to call afterwards.
   */
  query<TParams extends SearchParams>(
    builder: (params: TParams, context: QueryContext<P, S>) => QueryBuilder | QueryPlan,
  ): Search<TParams, TPreview>;
}

/** What one declaration has accumulated as its steps are walked. */
interface Draft {
  /** The name the index is declared under. */
  name: string;

  /** The index in the cluster. */
  index: string;

  /** The table the index is declared on. */
  table: string;

  /** The column of that table identifying one document. */
  key: string;

  /** How many results a page holds by default. */
  pageSize: number;

  /** How long a page and a preview are kept. */
  ttl: Duration;

  /** The analysis the index is created with. */
  settings: IndexSettings;
}

// deno-lint-ignore no-explicit-any
type Loose = any;

/**
 * How an index is declared, and the only way to obtain one.
 *
 * ```ts
 * const stores = Search.on<StoreRow>("stores", "store_id")
 *   .document((s) => ({
 *     name: Field.text(s.name, { boost: 3, sortable: true }),
 *     open: Field.bool(s.is_open),
 *   }))
 *   .preview((s) => ({ id: s.store_id, name: s.name }))
 *   .sorts((f) => ({ name: f.keyword("name", SortOrder.Asc) }))
 *   .query((params: StoreSearch, { q, f, sorts }) =>
 *     q.text(params.text)
 *       .filter(params.open !== undefined && { term: { [f.field("open")]: params.open } })
 *       .sort(sorts.name)
 *   );
 * ```
 *
 * @remarks
 * An index is **built, not extended**: there is nothing to subclass and nothing to override,
 * which is what keeps every index of the fleet mapped, loaded and cached the same way. What a
 * project writes is which columns the index holds, what a result looks like, and how its
 * parameters narrow the search. The select lists, the mapping, the tables whose changes
 * rebuild a document and the fields a free-text query looks in all come out of the document
 * declaration, so none of them can drift from it.
 *
 * Nothing here reaches the cluster or the database. Declaring costs nothing until something is
 * searched, and the index the cluster holds is written by `syncDeclaredIndices` at boot.
 */
export const Search: {
  on<TRow extends object>(
    table: string,
    key: keyof TRow & string,
    options?: IndexOptions,
  ): DocumentStep<TRow>;
} = {
  /**
   * Starts a declaration on `table`, whose rows are identified by `key`.
   *
   * `TRow` is the row of the table, named rather than inferred because this package knows
   * nothing of the project's schema. Naming it is what makes every column the declaration
   * reads checked against the table it comes from.
   */
  on<TRow extends object>(table: string, key: keyof TRow & string, options: IndexOptions = {}): DocumentStep<TRow> {
    const name = options.name ?? table;

    return documentStep<TRow>({
      name,
      index: options.index ?? name,
      table,
      key,
      pageSize: options.pageSize ?? DEFAULT_PAGE_SIZE,
      ttl: options.ttl ?? DEFAULT_TTL,
      settings: options.settings ?? DEFAULT_SETTINGS,
    });
  },
};

/** The step that compiles the document, and hands the preview step what came out of it. */
function documentStep<TRow extends object>(draft: Draft): DocumentStep<TRow> {
  return {
    document: (builder: (s: DocumentSelector<TRow>) => Loose): Loose => {
      const document = compileDocument(draft.table, draft.key, builder(documentSelector<TRow>()));
      return previewStep<TRow>(draft, document);
    },
  };
}

/** The step that compiles the preview, and hands the query step what came out of it. */
function previewStep<TRow extends object>(
  draft: Draft,
  document: ReturnType<typeof compileDocument>,
): Loose {
  return {
    preview: (builder: (s: PreviewSelector<TRow>) => PreviewShape): Loose => {
      const preview = compilePreview(builder(previewSelector<TRow>()), [draft.key]);
      return queryStep(draft, document, preview, {});
    },
  };
}

/** The step that names the sorts and compiles the query, then registers what it built. */
function queryStep(
  draft: Draft,
  document: ReturnType<typeof compileDocument>,
  preview: ReturnType<typeof compilePreview>,
  sorts: DeclaredSorts,
): Loose {
  const fields = document.textFields.map(({ path, boost }) => boost === null ? path : `${path}^${boost}`);

  return {
    sorts: (builder: (f: QueryFields<Loose>) => DeclaredSorts): Loose =>
      queryStep(draft, document, preview, builder(queryFields())),

    query: (builder: (params: Loose, context: QueryContext<Loose, Loose>) => QueryBuilder | QueryPlan): Loose => {
      const index = new SearchIndex({
        ...draft,
        document,
        preview,
        plan: (params: Loose): QueryPlan => {
          const built = builder(params, { q: new QueryBuilder(fields), f: queryFields(), sorts });
          return built instanceof QueryBuilder ? built.build() : built;
        },
      });

      declareIndex(index);
      return index;
    },
  };
}
