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
import { TypedQueryBuilder } from "./query/builder.ts";
import type { RelNode } from "./query/selector.ts";

/**
 * A Postgres function call, typed by the row shape it answers.
 *
 * The type is named rather than inferred because the engine is a published package now: a
 * member of the public surface has to carry an explicit type, and `no-slow-types` refuses
 * anything a consumer would have to infer.
 */
export type RpcBuilder<T extends object> = ReturnType<PostgrestClient["rpc"]> & { _row: T };

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

export type PostgrestClientSource = PostgrestClient | (() => PostgrestClient);

export class TablesBase {
  readonly #source: PostgrestClientSource;
  #client: PostgrestClient | null = null;

  constructor(source: PostgrestClientSource) {
    this.#source = source;
  }

  protected get db(): PostgrestClient {
    if (this.#client === null) {
      this.#client = typeof this.#source === "function" ? this.#source() : this.#source;
    }
    return this.#client;
  }

  /** Calls a Postgres function, typed by the rows it answers. */
  rpc<R extends object = object>(
    fn: string,
    args?: Record<string, unknown>,
  ): RpcBuilder<R> {
    return rpc<R>(this.db, fn, args);
  }
}
