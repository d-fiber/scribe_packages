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

import type { IndexConfig } from "./definition.ts";
import type { QueryPlan } from "./definition.ts";

/** One document on its way into the index. */
export interface IndexedDocument {
  /** The identifier the document is written under, which is its value of the declared key. */
  readonly id: string;

  /** The document itself, shaped as the declaration's mapping describes it. */
  readonly source: Record<string, unknown>;
}

/** What one search asked of the cluster. */
export interface SearchRequest {
  /** The index to look in. */
  readonly index: string;

  /** The compiled plan. */
  readonly plan: QueryPlan;

  /**
   * The column one document is identified by, for a transport that names its documents by a
   * field rather than by an identifier of its own.
   */
  readonly key: string;

  /** How many results to skip. */
  readonly from: number;

  /** How many results to answer with. */
  readonly size: number;
}

/** What one search answered. */
export interface SearchHits {
  /** The identifiers of the matched documents, in the order the cluster ranked them. */
  readonly ids: readonly string[];

  /** How many documents matched in total, which is what pagination is computed against. */
  readonly total: number;
}

/**
 * Where a declaration's documents go, and where its searches are answered.
 *
 * @remarks
 * The port exists so the cluster is replaceable. `OpenSearchTransport` is what a mounted
 * package installs, and the test harness swaps in one that records instead of sending, which
 * is what lets a suite exercise a declaration without a cluster.
 */
export interface SearchTransport {
  /**
   * Makes the index `name` exist and match `config`, and answers whether it now does.
   *
   * It is called once per declared index at boot, and it must be safe to call again on an
   * index that already matches.
   */
  ensure(name: string, config: IndexConfig): Promise<boolean>;

  /** Writes `documents` into the index `name`, and answers how many went in. */
  index(name: string, documents: readonly IndexedDocument[]): Promise<number>;

  /** Takes `ids` out of the index `name`, and answers how many went. */
  remove(name: string, ids: readonly string[]): Promise<number>;

  /** Answers what `request` matched, or null when the cluster could not answer. */
  search(request: SearchRequest): Promise<SearchHits | null>;
}
