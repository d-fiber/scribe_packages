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

import type { Pagination } from "@scribe/core/contracts/pagination.ts";
import type { Result } from "@scribe/core/contracts/result.ts";
import type { BoolQuery, SearchSort } from "./query.ts";

/** What every set of search parameters carries, whatever else a declaration asks for. */
export interface SearchParams {
  /** Which slice of the results to answer with. The first page of the declared size when absent. */
  page?: {
    /** How many results to skip. Zero when absent. */
    from?: number;

    /** How many results to answer with. The declaration's own default when absent. */
    size?: number;
  };
}

/** One search, compiled into what travels to the cluster. */
export interface QueryPlan {
  /** The boolean clause the plan narrows with. */
  readonly bool: BoolQuery["bool"];

  /** The sort clauses, in the order they break ties. Scoring order when empty. */
  readonly sort: readonly SearchSort[];
}

/** The analysis an index is created with, which decides how text is cut and folded. */
export interface IndexSettings {
  /** The normalizers and analyzers this index defines. */
  analysis?: {
    /** Normalizers, which fold a keyword whole rather than cutting it into terms. */
    normalizer?: Record<string, {
      /** The kind, always custom since a built-in one needs no declaration. */
      type: "custom";

      /** The filters applied in order, such as lowercasing and accent folding. */
      filter: string[];
    }>;

    /** Analyzers, which cut text into terms and then filter them. */
    analyzer?: Record<string, {
      /** The kind, always custom since a built-in one needs no declaration. */
      type: "custom";

      /** What cuts the text into terms. */
      tokenizer: string;

      /** The filters applied to each term in order. */
      filter: string[];
    }>;
  };
}

/** The mapping an index is created with, one entry per field of the document. */
export interface IndexMappings {
  /** The fields, keyed by the name they carry in the document. */
  properties: Record<string, unknown>;
}

/** Everything an index needs to exist, as the transport writes it. */
export interface IndexConfig {
  /** The analysis, left to the cluster's own defaults when absent. */
  settings?: IndexSettings;

  /** The fields of the document. */
  mappings: IndexMappings;
}

/** One table that feeds an index, and how a row of it names the document it belongs to. */
export interface SearchSource {
  /** The table, as Postgres names it. */
  readonly table: string;

  /**
   * The column of that table holding the identifier of the document the row belongs to.
   *
   * It is the primary key on the table the index is declared on, and the foreign key back to
   * it on every table folded in, which is what lets a change anywhere name what to rebuild.
   */
  readonly key: string;
}

/** Which way a document moves when the outbox is drained. */
export enum SearchOperation {
  /** The document is rebuilt from its tables and written to the index. */
  Index = "index",

  /** The document is taken out of the index. */
  Delete = "delete",
}

/**
 * What a project holds once it has declared an index.
 *
 * @remarks
 * It is deliberately three verbs wide. Everything else the package can do is either derived
 * from the declaration or reached through the outbox, and a surface a project can call is a
 * surface it can call wrongly.
 */
export interface Search<TParams extends SearchParams, TPreview> {
  /** The name this index was declared under. */
  readonly name: string;

  /**
   * Queues the document `id` for a rebuild, and answers whether the request was recorded.
   *
   * A project whose table carries the package's trigger never calls this. It is for the
   * documents no table change announces, such as one built from an outside service.
   */
  add(id: string): Promise<boolean>;

  /** Queues every identifier of `ids` for a rebuild, in one write. */
  addMany(ids: readonly string[]): Promise<boolean>;

  /** Queues the document `id` for removal, and answers whether the request was recorded. */
  delete(id: string): Promise<boolean>;

  /**
   * Answers the page of previews `params` asks for.
   *
   * A cluster that cannot be reached, or a plan it refuses, answers a failure rather than
   * throwing: a search is one part of a page, and a caller decides whether an empty section
   * is worse than no page at all.
   */
  search(params: TParams): Promise<Result<Pagination<TPreview>, void>>;

  /**
   * The plan `params` compiles into, without reaching the cluster.
   *
   * It is what makes a declaration's query and sorts testable, since the whole point of a
   * sort written in Painless is what it returns for a given set of parameters.
   */
  plan(params: TParams): QueryPlan;
}
