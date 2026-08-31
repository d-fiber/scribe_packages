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

import type {
  MappingBooleanProperty,
  MappingDateProperty,
  MappingGeoPointProperty,
  MappingKeywordProperty,
  MappingNestedProperty,
  MappingNumberProperty,
  MappingObjectProperty,
  MappingProperty,
  MappingTextProperty,
} from "@opensearch-project/opensearch/api/types";
import type { IndexSettings } from "../../contracts/definition.ts";

export type { MappingProperty };

/** The analyzer every sortable text field folds its keyword through, declared by the defaults. */
/**
 * The normalizer the folded keyword of a sortable text field is written through.
 *
 * A declaration passing its own `settings` has to declare a normalizer under this name, since
 * that is the one every sortable field points at. An index whose analysis does not hold it is
 * refused by the cluster at creation.
 */
export const SORT_NORMALIZER = "sort_normalizer";

/**
 * The analysis an index is created with when a declaration asks for none.
 *
 * @remarks
 * The two filters are what make a search behave the way someone typing expects it to: case is
 * ignored, and an accent is folded away, so `creme` finds `Crème`. They are applied twice, once
 * to the analysed text and once to the keyword a sortable field carries, so that a list sorted
 * by name does not put every capitalised row before every other.
 */
export const DEFAULT_SETTINGS: IndexSettings = {
  analysis: {
    normalizer: {
      [SORT_NORMALIZER]: { type: "custom", filter: ["lowercase", "asciifolding"] },
    },
    analyzer: {
      default: { type: "custom", tokenizer: "standard", filter: ["lowercase", "asciifolding"] },
    },
  },
};

/** A text field carrying the folded copy a sort compares. */
export type SortableText = MappingTextProperty & {
  /** The subfields, of which the folded keyword is the one a sort names. */
  fields: {
    /** The copy kept whole and folded, which is what `f.keyword` sorts on. */
    keyword: MappingKeywordProperty;
  };
};

/** What one field of a document declares: where it comes from, and what the index makes of it. */
// deno-lint-ignore no-explicit-any -- MappedField and EmbeddedField constrain their parameters, which unknown fails, and DocumentShape is what this line itself declares.
export type DocumentShape = { readonly [field: string]: MappedField<any> | EmbeddedField<any, any> };

/** What a field declaration takes beyond the column it reads. */
export interface FieldOptions {
  /** What the mapping carries on top of what the kind decides, such as an analyzer. */
  readonly mapping?: Record<string, unknown>;
}

/** What a text field takes beyond the column it reads. */
export interface TextOptions extends FieldOptions {
  /**
   * How much this field weighs against the other text fields of the same query.
   *
   * A free-text search that names no field looks in every text field of the declaration, each
   * with the weight given here. One when absent.
   */
  readonly boost?: number;

  /**
   * Whether this field can also be sorted on.
   *
   * Analysed text cannot be sorted, so a sortable field carries a folded keyword copy beside
   * it, and `f.keyword(name, order)` is what sorts on that copy.
   */
  readonly sortable?: boolean;
}

/**
 * One field of a document: the column it reads, and what the index is told about it.
 *
 * @remarks
 * Carrying both in one object is what lets a single declaration produce the mapping, the
 * columns the loader selects, and the weights a free-text query uses. `toString` answers the
 * column so a shape can be turned into a select list without unwrapping anything.
 *
 * `M` is the mapping this field writes, and it is a type parameter so a query can be checked
 * against it: `f.boost` takes a text field and `f.keyword` a sortable one, which is decided by
 * looking at `M` and not by trusting the name.
 */
export class MappedField<M extends MappingProperty = MappingProperty> {
  /** The column this field reads, as Postgres names it. */
  readonly column: string;

  /** What the index is told about this field. */
  readonly mapping: M;

  /** Whether a free-text query that names no field looks in this one. */
  readonly textual: boolean;

  /** How much this field weighs against the other text fields, or null when it weighs one. */
  readonly boost: number | null;

  readonly #read: (value: unknown) => unknown;

  constructor(
    column: string,
    mapping: M,
    options: {
      /** Whether a free-text query naming no field looks here. */
      textual?: boolean;

      /** What this field weighs against the other text fields. */
      boost?: number | null;

      /** What the index should hold, when it is not what the database answered. */
      read?: (value: unknown) => unknown;
    } = {},
  ) {
    this.column = column;
    this.mapping = mapping;
    this.textual = options.textual ?? false;
    this.boost = options.boost ?? null;
    this.#read = options.read ?? ((value) => value);
  }

  /** What the index should hold for `value`, as the database answered it. */
  read(value: unknown): unknown {
    return value === null || value === undefined ? null : this.#read(value);
  }

  /** The column, so a shape reads as a select list without being unwrapped. */
  toString(): string {
    return this.column;
  }
}

/** What an embedded field takes beyond the relation it folds in. */
export interface EmbedOptions {
  /**
   * Whether the rows stay searchable one by one rather than being flattened into the document.
   *
   * False when absent, which is what a relation answering one row wants. A relation answering
   * several needs it: flattened, a document holding brands `a` and `b` matches a clause asking
   * for the name of `a` and the rank of `b`.
   */
  readonly nested?: boolean;

  /** Whether the relation answers several rows. Implied by `nested`, and false otherwise. */
  readonly many?: boolean;

  /** Whether a document with no row on the far side is dropped rather than carrying nothing. */
  readonly inner?: boolean;

  /**
   * The column of the far table holding the identifier of the document its rows belong to.
   *
   * It is what a trigger on that table reads to name the document to rebuild. The declared key
   * of the index when absent, which is the shape a foreign key back to the indexed table takes
   * unless it was named otherwise.
   */
  readonly key?: string;
}

/**
 * One relation folded into a document, and what the index makes of the rows it brings.
 *
 * @remarks
 * The relation is what makes the reverse link known: a table folded in here is a table whose
 * changes have to rebuild this document, and that is what `compileDocument` reads to write the
 * correspondence the triggers are attached against.
 *
 * `N` says whether the rows stay searchable one by one, and it is a type parameter so that
 * `f.nested` refuses a path that is not one. A plain object flattens its rows, so a document
 * with brands `a` and `b` would match a clause asking for the name of `a` and the rank of `b`.
 */
export class EmbeddedField<S extends DocumentShape = DocumentShape, N extends boolean = boolean> {
  /** The relation to fold in, as PostgREST names it, which is the far table or the constraint. */
  readonly relation: string;

  /** The fields taken from each folded row. */
  readonly shape: S;

  /** Whether the rows stay searchable one by one. */
  readonly nested: N;

  /** Whether the relation answers several rows. */
  readonly many: boolean;

  /** Whether a document with no row on the far side is dropped. */
  readonly inner: boolean;

  /** The column of the far table naming the document, or null to take the index's own key. */
  readonly key: string | null;

  constructor(relation: string, shape: S, nested: N, options: EmbedOptions = {}) {
    this.relation = relation;
    this.shape = shape;
    this.nested = nested;
    this.many = options.many ?? nested;
    this.inner = options.inner ?? false;
    this.key = options.key ?? null;
  }
}

/** Reads a point the way the cluster wants it, whichever of the two spellings the column holds. */
function geoPoint(value: unknown): unknown {
  if (value === null || typeof value !== "object") return null;

  const point = value as Record<string, unknown>;
  const lat = point.lat;
  const lon = point.lon ?? point.lng;

  if (typeof lat !== "number" || typeof lon !== "number") return null;
  return { lat, lon };
}

/** What the declaration of one field looks like, one entry per kind an index can hold. */
export interface FieldFactory {
  /** An exact value, matched whole: a status, an identifier, a code. */
  keyword(column: string, options?: FieldOptions): MappedField<MappingKeywordProperty>;

  /** Analysed text carrying the folded copy a sort compares. */
  text(
    column: string,
    options: TextOptions & { readonly sortable: true },
  ): MappedField<SortableText>;

  /** Analysed text, matched by term and reachable by a free-text query. */
  text(column: string, options?: TextOptions): MappedField<MappingTextProperty>;

  /** A moment held as milliseconds since the epoch, which is what a `long` compares. */
  timestamp(column: string, options?: FieldOptions): MappedField<MappingNumberProperty>;

  /** A moment held as a date the cluster parses, which is what date math compares against. */
  date(column: string, options?: FieldOptions): MappedField<MappingDateProperty>;

  /** A point on the globe, read from either spelling of its longitude. */
  geo(column: string, options?: FieldOptions): MappedField<MappingGeoPointProperty>;

  /** A yes or no. */
  bool(column: string, options?: FieldOptions): MappedField<MappingBooleanProperty>;

  /** A whole number up to about two billion. */
  integer(column: string, options?: FieldOptions): MappedField<MappingNumberProperty>;

  /** A whole number up to about thirty-two thousand. */
  short(column: string, options?: FieldOptions): MappedField<MappingNumberProperty>;

  /** A number with a decimal part, at single precision. */
  float(column: string, options?: FieldOptions): MappedField<MappingNumberProperty>;

  /** A number with a decimal part, at double precision. */
  double(column: string, options?: FieldOptions): MappedField<MappingNumberProperty>;
}

/** What an object field and a nested field write into the mapping. */
export type EmbeddedMapping<S extends DocumentShape, N extends boolean> = N extends true ? MappingNestedProperty
  : MappingObjectProperty;

/** Builds a number field of `type`, which the four whole-number kinds share. */
function numeric(
  column: string,
  type: MappingNumberProperty["type"],
  options?: FieldOptions,
): MappedField<MappingNumberProperty> {
  return new MappedField(column, { type, ...options?.mapping } as MappingNumberProperty);
}

/**
 * How each field of a document is declared.
 *
 * ```ts
 * Field.text(s.title, { boost: 3, sortable: true });
 * Field.keyword(s.status);
 * Field.geo(s.location);
 * ```
 */
export const Field: FieldFactory = {
  keyword: (column, options) =>
    new MappedField(column, { type: "keyword", ...options?.mapping } as MappingKeywordProperty),

  // deno-lint-ignore no-explicit-any -- text is overloaded on options.sortable, and no single return type satisfies both overloads for one implementation.
  text: ((column: string, options?: TextOptions): any =>
    new MappedField(
      column,
      {
        type: "text",
        ...(options?.sortable ? { fields: { keyword: { type: "keyword", normalizer: SORT_NORMALIZER } } } : {}),
        ...options?.mapping,
      } as MappingTextProperty,
      { textual: true, boost: options?.boost ?? null },
    )) as FieldFactory["text"],

  timestamp: (column, options) => numeric(column, "long", options),

  date: (column, options) => new MappedField(column, { type: "date", ...options?.mapping } as MappingDateProperty),

  geo: (column, options) =>
    new MappedField(
      column,
      { type: "geo_point", ...options?.mapping } as MappingGeoPointProperty,
      { read: geoPoint },
    ),

  bool: (column, options) =>
    new MappedField(column, { type: "boolean", ...options?.mapping } as MappingBooleanProperty),

  integer: (column, options) => numeric(column, "integer", options),

  short: (column, options) => numeric(column, "short", options),

  float: (column, options) => numeric(column, "float", options),

  double: (column, options) => numeric(column, "double", options),
};
