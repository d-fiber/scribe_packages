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

import { type DocumentShape, EmbeddedField, type EmbedOptions } from "../fields/mapping.ts";

/**
 * What a document declaration is handed: the columns of the row, and a way to fold in a relation.
 *
 * @remarks
 * Every column of `TRow` reads as its own name, so `s.title` is the string `"title"` typed as
 * `"title"`. A column the row does not carry does not compile, which is what keeps a renamed
 * table from silently indexing nothing.
 */
export type DocumentSelector<TRow extends object> =
  & { readonly [K in keyof TRow & string]: K }
  & {
    /**
     * Folds `relation` into the document, taking the fields the builder declares from each row.
     *
     * The row on the far side is named by annotating the builder, since nothing in this package
     * knows the project's schema. It is written there rather than as a type argument because
     * the declared fields have to stay inferred: they are what `f.path` and `f.nested` read to
     * refuse a field the folded relation does not hold.
     *
     * ```ts
     * s.embed("brands", (b: DocumentSelector<BrandRow>) => ({ label: Field.text(b.label) }))
     * ```
     */
    readonly embed: {
      <const S extends DocumentShape, TSub extends object = object>(
        relation: string,
        builder: (s: DocumentSelector<TSub>) => S,
        options?: EmbedOptions & { readonly nested?: false },
      ): EmbeddedField<S, false>;

      /** Folds `relation` in, keeping each of its rows searchable on its own. */
      <const S extends DocumentShape, TSub extends object = object>(
        relation: string,
        builder: (s: DocumentSelector<TSub>) => S,
        options: EmbedOptions & { readonly nested: true },
      ): EmbeddedField<S, true>;
    };
  };

/** One leaf or one branch of a preview declaration. */
export type PreviewShape = { readonly [key: string]: unknown };

/**
 * One relation folded into a preview, and the fields taken from each of its rows.
 *
 * @remarks
 * `M` carries the cardinality in the type so the preview a search answers with is exact: a
 * relation answering one row types as an object or null, and one answering several types as
 * an array. Deciding it at runtime would leave the caller narrowing a union that cannot occur.
 */
export class PreviewEmbed<TSub extends object, S extends PreviewShape, M extends boolean> {
  /** The relation to fold in, as PostgREST names it. */
  readonly relation: string;

  /** The fields taken from each folded row. */
  readonly shape: S;

  /** Whether the relation answers several rows. */
  readonly many: M;

  /** Whether a preview with no row on the far side is dropped. */
  readonly inner: boolean;

  readonly #row: TSub | null = null;

  constructor(relation: string, shape: S, many: M, inner: boolean) {
    this.relation = relation;
    this.shape = shape;
    this.many = many;
    this.inner = inner;
  }

  /** The row this embed reads, which exists to hold `TSub` and is never filled. */
  get row(): TSub | null {
    return this.#row;
  }
}

/** What a preview declaration is handed: the columns of the row, and a way to fold in a relation. */
export type PreviewSelector<TRow extends object> =
  & { readonly [K in keyof TRow & string]: K }
  & {
    /**
     * Folds `relation` in, answering one row or nothing.
     *
     * The row on the far side is named by annotating the builder, as it is on a document, so
     * that the fields the preview reads stay inferred and the type one result answers with is
     * exactly what the shape says.
     *
     * ```ts
     * s.embed("brands", (b: PreviewSelector<BrandRow>) => ({ label: b.label }))
     * ```
     */
    readonly embed: {
      <const S extends PreviewShape, TSub extends object = object>(
        relation: string,
        builder: (s: PreviewSelector<TSub>) => S,
        options?: { readonly many?: false; readonly inner?: boolean },
      ): PreviewEmbed<TSub, S, false>;

      /** Folds `relation` in, answering every row it holds. */
      <const S extends PreviewShape, TSub extends object = object>(
        relation: string,
        builder: (s: PreviewSelector<TSub>) => S,
        options: { readonly many: true; readonly inner?: boolean },
      ): PreviewEmbed<TSub, S, true>;
    };
  };

/** What a preview declaration answers with, derived from the shape it declared. */
export type PreviewOf<TRow extends object, S> = {
  -readonly [K in keyof S]: S[K] extends PreviewEmbed<infer TSub, infer Sub, infer M>
    ? TSub extends object ? M extends true ? PreviewOf<TSub, Sub>[] : PreviewOf<TSub, Sub> | null
    : never
    : S[K] extends keyof TRow ? TRow[S[K] & keyof TRow]
    : S[K] extends PreviewShape ? PreviewOf<TRow, S[K]>
    : never;
};

/** Hands a document declaration a selector over `TRow`. */
export function documentSelector<TRow extends object>(): DocumentSelector<TRow> {
  const embed = (
    relation: string,
    builder: (s: unknown) => DocumentShape,
    options?: EmbedOptions,
  ): EmbeddedField<DocumentShape, boolean> =>
    new EmbeddedField(relation, builder(documentSelector()), options?.nested ?? false, options);

  return proxyOver({ embed });
}

/** Hands a preview declaration a selector over `TRow`. */
export function previewSelector<TRow extends object>(): PreviewSelector<TRow> {
  const embed = (
    relation: string,
    builder: (s: unknown) => PreviewShape,
    options?: { many?: boolean; inner?: boolean },
  ): PreviewEmbed<object, PreviewShape, boolean> =>
    new PreviewEmbed(
      relation,
      builder(previewSelector()),
      options?.many ?? false,
      options?.inner ?? false,
    );

  return proxyOver({ embed });
}

/** A selector answering its own key for every column, and the folding function for `embed`. */
function proxyOver<T>(carried: { embed: unknown }): T {
  return new Proxy(carried, {
    get: (target, key) => {
      if (typeof key !== "string") return undefined;
      return key === "embed" ? (target as Record<string, unknown>).embed : key;
    },
  }) as T;
}
