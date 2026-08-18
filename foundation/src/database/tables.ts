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
