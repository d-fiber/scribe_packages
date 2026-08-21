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

import { PostgrestClients } from "./client.ts";
import type { PostgrestClientSource } from "./query/builder.ts";
import { TypedQueryBuilder } from "./query/builder.ts";
import type { RelNode } from "./query/selector.ts";

/** What one table of a schema is: the shape of a row, and the relations it can embed. */
export interface TableShape {
  /** The shape of one row of this table. */
  readonly row: object;

  /** What this table can embed, keyed by the name a selection uses. None when absent. */
  readonly relations?: Record<string, RelNode>;
}

/**
 * A whole schema, as a map from table name to shape.
 *
 * The engine never holds one. It is a type parameter, filled by whoever owns the SQL, which is
 * what keeps this package free of any knowledge of a particular database.
 */
export type DatabaseSchema = Record<string, TableShape>;

type RowOf<S extends DatabaseSchema, K extends keyof S> = S[K]["row"];

type RelationsOf<S extends DatabaseSchema, K extends keyof S> = S[K]["relations"] extends Record<string, RelNode>
  ? S[K]["relations"]
  : Record<string, never>;

/**
 * A handle on one table of a schema, and the start of a query on it.
 *
 * It is the base a bound `Database` extends, never used directly: the schema that types it is
 * derived from the SQL, so it lives with the SQL and not here.
 *
 * ```ts
 * // written by the generator, next to the schema it derives
 * export class Database<K extends keyof AppSchema & string> extends Table<AppSchema, K> {}
 *
 * // written by hand
 * const users = new Database("table_name");
 * ```
 *
 * Constraining the name by `keyof S` is what makes the SQL the single source of truth: a table
 * nobody declared, or a name with a typo in it, does not compile. There is nothing to configure
 * and nothing to keep in step by hand.
 *
 * A handle is safe to keep at module scope. It holds no client and no identity, because the
 * owner filter is decided when a query is compiled, from whoever is calling then. One built at
 * import time therefore serves every request without carrying anything from the first.
 */
export class Table<
  S extends DatabaseSchema,
  K extends keyof S & string,
> extends TypedQueryBuilder<RowOf<S, K>, RowOf<S, K>, RelationsOf<S, K>> {
  constructor(
    table: K,
    source: PostgrestClientSource = () => PostgrestClients.service(),
  ) {
    super(source, table);
  }
}
