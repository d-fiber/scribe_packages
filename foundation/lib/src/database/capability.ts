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

import { create } from "@bufbuild/protobuf";
import {
  Operation,
  type Query,
  type QueryBatch,
  type QueryResult,
  type QueryResultBatch,
  QueryResultBatchSchema,
  QueryResultSchema,
} from "@scribe/sdk/gen/scribe/packages/foundation/protocol/database_pb.ts";
import { decodeJson, encodeJson } from "@scribe/sdk";
import type { PostgrestClient } from "@supabase/postgrest-js";
import { causeMessage } from "../error_message.ts";
import { PostgrestClients } from "./postgrest_clients.ts";
import { AMBIGUITY_PROBE } from "./query/query_state.ts";
import { applyFilters, applyOperator } from "./query/wire_filters.ts";
import { ownedPayload, ownerFilter, reachesEveryRow } from "./query/wire_guard.ts";

function selection(query: Query): string {
  return query.select.length > 0 ? query.select.join(",") : "*";
}

// deno-lint-ignore no-explicit-any -- the builder type differs at each chained call, picked by a runtime Operation, so no single type covers every stage.
function started(query: Query, db: PostgrestClient): any {
  const payload = query.payload === undefined ? undefined : decodeJson(query.payload);

  switch (query.operation) {
    case Operation.INSERT:
      return db.from(query.table).insert(ownedPayload(query, payload)).select(selection(query));
    case Operation.UPDATE:
      return db.from(query.table).update(payload).select(selection(query));
    case Operation.UPSERT:
      return db
        .from(query.table)
        .upsert(ownedPayload(query, payload), {
          onConflict: query.onConflict.length > 0 ? query.onConflict.join(",") : undefined,
        })
        .select(selection(query));
    case Operation.DELETE:
      return db.from(query.table).delete().select(selection(query));
    default:
      return db.from(query.table).select(selection(query), {
        count: query.countExact ? "exact" : undefined,
      });
  }
}

// deno-lint-ignore no-explicit-any -- see started: the builder type varies by chained call.
function shaped(builder: any, query: Query): any {
  let current = builder;

  for (const order of query.order) {
    current = current.order(order.column, {
      ascending: !order.descending,
      nullsFirst: order.nullsFirst,
    });
  }

  const range = query.range;
  if (range && range.limit > 0) {
    current = current.range(range.offset, range.offset + range.limit - 1);
  } else if (range && range.offset > 0) {
    current = current.range(range.offset, range.offset + 999);
  } else if (query.single) {
    current = current.limit(AMBIGUITY_PROBE);
  }

  return query.single ? current.maybeSingle() : current;
}

async function runRpc(query: Query): Promise<QueryResult> {
  const db = PostgrestClients.service();
  const { data, error } = await db.rpc(query.rpcName, decodeJson(query.rpcArgs) ?? {});

  return create(QueryResultSchema, {
    data: encodeJson(data ?? null),
    error: error ? { code: error.code ?? "rpc_failed", message: error.message } : undefined,
  });
}

/**
 * The result of `query`, run against PostgREST under the service role.
 *
 * @throws {Error} When the caller owns a different row than the one `query` reaches. Owner scoping
 * is decided here, in TypeScript, and never by a row level security policy.
 */
export async function executeQuery(query: Query): Promise<QueryResult> {
  if (query.operation === Operation.RPC) return runRpc(query);

  if (reachesEveryRow(query)) {
    return create(QueryResultSchema, {
      error: {
        code: "unbounded_write",
        message: `refusing to ${Operation[query.operation].toLowerCase()} every row of "${query.table}": ` +
          "the query names no row, and no column says who a row belongs to.",
      },
    });
  }

  const db = PostgrestClients.service();

  let builder = started(query, db);
  builder = applyFilters(builder, query.where);

  const owner = ownerFilter(query);
  if (owner) builder = applyOperator(builder, owner);

  const { data, error, count } = await shaped(builder, query);

  return create(QueryResultSchema, {
    data: encodeJson(data ?? null),
    count: BigInt(count ?? 0),
    error: error ? { code: error.code ?? "query_failed", message: error.message } : undefined,
  });
}

function refused(cause: unknown): QueryResult {
  return create(QueryResultSchema, { error: { code: "query_refused", message: causeMessage(cause) } });
}

/**
 * The results of every query in `batch`, in the order the batch listed them.
 *
 * @remarks
 * The queries run concurrently, so a batch is for queries that do not read what another one in the
 * same batch writes. What it buys is the round trip: a worker that reads three times pays one hop
 * to the host instead of three, and the hop is what a request on this path spends most of its time
 * in.
 *
 * A query the owner check refuses answers a `query_refused` entry rather than sinking the batch,
 * because the caller asked for several answers and the ones it may have are still worth returning.
 */
export async function executeQueries(batch: QueryBatch): Promise<QueryResultBatch> {
  const results = await Promise.all(
    batch.queries.map((query) => executeQuery(query).catch(refused)),
  );

  return create(QueryResultBatchSchema, { results });
}
