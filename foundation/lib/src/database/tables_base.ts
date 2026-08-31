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

import type { PostgrestClient } from "@supabase/postgrest-js";
import { TypedQueryBuilder } from "./query/typed_query_builder.ts";
import type { RelNode } from "./query/selector.ts";

/**
 * A Postgres function call, typed by the row shape it answers.
 *
 * The type is named rather than inferred because the engine is a published package now: a
 * member of the public surface has to carry an explicit type, and `no-slow-types` refuses
 * anything a consumer would have to infer.
 */
export type RpcBuilder<T extends object> = ReturnType<PostgrestClient["rpc"]> & { _row: T };

/**
 * Opens a query against `table`, typed by the row shape `T` and the relations `Rels` a generated
 * table accessor declares.
 *
 * @remarks
 * Every method a generated table class exposes is a thin call into this, since the query builder
 * itself does not know a table's row shape at compile time, only what a caller tells it here.
 */
export function from<
  T extends object,
  Rels extends Record<string, RelNode> = Record<string, never>,
>(db: PostgrestClient, table: string): TypedQueryBuilder<T, T, Rels> {
  return new TypedQueryBuilder<T, T, Rels>(db, table);
}

function rpc<T extends object>(
  db: PostgrestClient,
  fn: string,
  args?: Record<string, unknown>,
): RpcBuilder<T> {
  return db.rpc(fn, args) as RpcBuilder<T>;
}

/**
 * A PostgREST client, or a thunk that produces one when first asked.
 *
 * @remarks
 * A thunk is what lets a `TablesBase` be constructed before the host has finished wiring its
 * settings: a table accessor declared at module scope only needs a real client once a query
 * actually runs, not at the moment its class is instantiated.
 */
export type PostgrestClientSource = PostgrestClient | (() => PostgrestClient);

/**
 * The base every generated table accessor extends.
 *
 * @remarks
 * A row's own table class carries the typed columns and relations `from` needs; this base carries
 * the one thing every one of them shares regardless of row shape, resolving and holding the
 * PostgREST client, so that logic exists once instead of being generated fresh into every table
 * file.
 */
export class TablesBase {
  readonly #source: PostgrestClientSource;
  #client: PostgrestClient | null = null;

  constructor(source: PostgrestClientSource) {
    this.#source = source;
  }

  /**
   * The client this table handle reads and writes through, resolved from `source` on first use
   * and held from then on, so a thunk given a settings-dependent client to build only pays that
   * cost once per table handle rather than once per query.
   */
  protected get db(): PostgrestClient {
    if (this.#client === null) {
      this.#client = typeof this.#source === "function" ? this.#source() : this.#source;
    }
    return this.#client;
  }

  /** Calls the Postgres function named `fn`, typed by the rows `R` it answers. */
  rpc<R extends object = object>(
    fn: string,
    args?: Record<string, unknown>,
  ): RpcBuilder<R> {
    return rpc<R>(this.db, fn, args);
  }
}
