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
