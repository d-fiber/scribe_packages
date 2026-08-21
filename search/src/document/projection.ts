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

import type { SearchSource } from "../../contracts/definition.ts";
import { type DocumentShape, EmbeddedField, type MappedField, type MappingProperty } from "../fields/mapping.ts";

/** One text field of a document, and how much a free-text query weighs it. */
export interface TextField {
  /** The field, dotted when it sits inside a folded relation. */
  readonly path: string;

  /** What the field weighs, or null when it weighs one. */
  readonly boost: number | null;
}

/** What one document declaration produces, which is everything the engine needs from it. */
export interface CompiledDocument {
  /** The select list the loader reads with, aliased so every field lands under its own name. */
  readonly columns: string;

  /** The mapping the index is created with, keyed by field name. */
  readonly mappings: Record<string, MappingProperty>;

  /** Every table feeding this document, the indexed one first. */
  readonly sources: readonly SearchSource[];

  /** The text fields a free-text query looks in when it names none. */
  readonly textFields: readonly TextField[];

  /** The shape itself, which the reader walks to normalise a row. */
  readonly shape: DocumentShape;
}

/**
 * Turns one document declaration into the select list, the mapping, and the tables to watch.
 *
 * @remarks
 * The three come out of the same walk on purpose. They are three readings of one declaration,
 * and deriving them separately is what lets a mapping name a field the select never reads.
 *
 * @param table - The table the index is declared on.
 * @param key - The column of `table` identifying one document.
 *
 * @throws {TypeError} When a relation folded more than one level deep names no key. Its rows
 * cannot be tied back to a document without one, so a change to them would be missed.
 */
export function compileDocument(
  table: string,
  key: string,
  shape: DocumentShape,
): CompiledDocument {
  const sources: SearchSource[] = [{ table, key }];
  const textFields: TextField[] = [];

  collect(shape, key, 1, sources, textFields, []);

  return {
    columns: selectOf(shape, [key]),
    mappings: mappingsOf(shape),
    sources,
    textFields,
    shape,
  };
}

/**
 * The document to index for `row`, read through `shape`.
 *
 * A relation declared to answer one row is unwrapped here rather than at the query, because
 * PostgREST answers a list for a relation it reads as one-to-many whatever the declaration says.
 */
export function readDocument(
  shape: DocumentShape,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const document: Record<string, unknown> = {};

  for (const [field, declared] of Object.entries(shape)) {
    const value = row[field] ?? null;

    if (!(declared instanceof EmbeddedField)) {
      document[field] = (declared as MappedField).read(value);
      continue;
    }

    const rows = Array.isArray(value) ? value : value === null ? [] : [value];
    const read = rows.map((one) => readDocument(declared.shape, one as Record<string, unknown>));

    document[field] = declared.many ? read : read[0] ?? null;
  }

  return document;
}

/** The select list `shape` reads, with `first` at the front and every field aliased to its name. */
function selectOf(shape: DocumentShape, first: readonly string[]): string {
  const parts = [...first];

  for (const [field, declared] of Object.entries(shape)) {
    if (!(declared instanceof EmbeddedField)) {
      const column = declared.column;
      parts.push(field === column ? column : `${field}:${column}`);
      continue;
    }

    const relation = declared.inner ? `${declared.relation}!inner` : declared.relation;
    const named = field === declared.relation ? relation : `${field}:${relation}`;
    parts.push(`${named}(${selectOf(declared.shape, [])})`);
  }

  return [...new Set(parts)].join(", ");
}

/** What the index is told about every field of `shape`. */
function mappingsOf(shape: DocumentShape): Record<string, MappingProperty> {
  const mappings: Record<string, MappingProperty> = {};

  for (const [field, declared] of Object.entries(shape)) {
    mappings[field] = declared instanceof EmbeddedField
      ? {
        type: declared.nested ? "nested" : "object",
        properties: mappingsOf(declared.shape),
      } as MappingProperty
      : declared.mapping;
  }

  return mappings;
}

/** Walks `shape`, recording the tables that feed the document and the text fields it holds. */
function collect(
  shape: DocumentShape,
  key: string,
  depth: number,
  sources: SearchSource[],
  textFields: TextField[],
  path: readonly string[],
): void {
  for (const [field, declared] of Object.entries(shape)) {
    const here = [...path, field];

    if (!(declared instanceof EmbeddedField)) {
      if (declared.textual) textFields.push({ path: here.join("."), boost: declared.boost });
      continue;
    }

    if (declared.key === null && depth > 1) {
      throw new TypeError(
        `search: relation "${declared.relation}" is folded ${depth} levels deep and names no key, ` +
          "so a change to its rows cannot name the document to rebuild.",
      );
    }

    sources.push({ table: declared.relation, key: declared.key ?? key });
    collect(declared.shape, key, depth + 1, sources, textFields, here);
  }
}
