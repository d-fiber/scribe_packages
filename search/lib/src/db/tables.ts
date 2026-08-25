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

import { Table } from "@scribe/foundation";

/** One row of the record this package keeps of the indices it has created. */
export interface SearchIndexRow {
  /** The name the index was declared under, which is also how the outbox addresses it. */
  name: string;

  /** The index as it exists in the cluster, which a rebuild lets differ from the name. */
  index_name: string;

  /** The table the index is declared on. */
  source_table: string;

  /** The column of that table identifying one document. */
  source_key: string;

  /** A digest of the mapping last written, which is what says a field was added or retyped. */
  mappings_hash: string;

  /** A digest of the analysis last written, which is what says the index has to be reopened. */
  settings_hash: string;

  /** When the cluster was last made to match the declaration. */
  synced_at: string;
}

/** One row of the correspondence between a table and the index its changes feed. */
export interface SearchSourceRow {
  /** The index this table feeds. */
  index: string;

  /** The table, as Postgres names it. */
  source_table: string;

  /** The column of that table holding the identifier of the document its rows belong to. */
  source_key: string;
}

/** One document waiting to be written to, or taken out of, its index. */
export interface SearchOutboxRow {
  /** The index the document belongs to. */
  index: string;

  /** The identifier of the document. */
  entity_id: string;

  /** One of the values of `SearchOperation`, which says which way the document moves. */
  operation: string;

  /** When the row was written, in milliseconds since the epoch. */
  enqueued_at: number;

  /** How many drains have tried and failed on this row. */
  attempts: number;

  /** When the row stopped being retried, or null while it is still in line. */
  failed_at: string | null;

  /** What the last failed attempt reported, or null while it is still in line. */
  last_error: string | null;
}

/**
 * The three tables this package ships, as the query builder needs to see them.
 *
 * They are declared here rather than taken from a generated schema because the package owns
 * the SQL that creates them. A package that read its own tables out of a project's generated
 * file would stop compiling the day that project renamed something it does not own.
 */
export type SearchSchema = {
  /** What the cluster was last told, one row per declared index. */
  __search_indices__: { row: SearchIndexRow };

  /** Which table feeds which index, one row per pair. */
  __search_sources__: { row: SearchSourceRow };

  /** What is waiting to be indexed or removed. */
  __search_outbox__: { row: SearchOutboxRow };
};

/** A handle on one of this package's own tables. */
export class SearchTable<K extends keyof SearchSchema & string> extends Table<SearchSchema, K> {}

/** What the cluster was last told about each declared index. */
export function searchIndices(): SearchTable<"__search_indices__"> {
  return new SearchTable("__search_indices__");
}

/** Which table feeds which index. */
export function searchSources(): SearchTable<"__search_sources__"> {
  return new SearchTable("__search_sources__");
}

/** What is waiting to be indexed or removed. */
export function searchOutbox(): SearchTable<"__search_outbox__"> {
  return new SearchTable("__search_outbox__");
}
