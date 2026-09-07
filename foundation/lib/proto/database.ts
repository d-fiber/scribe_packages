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

import type { List, ProtoEnumBuilder, ProtoMessageBuilder, ProtoServiceBuilder } from "@scribe/alchemy";
import { Proto, ProtoBuilder, ProtoEnum, ProtoMessage, ProtoService } from "@scribe/alchemy";

/** The worker-facing contract for `Database`: run one PostgREST query, or a batch of them. */
@Proto("database")
export class DatabaseProtocol extends ProtoBuilder {
  /** The socle types this contract references: `scribe.v1.Json`, `scribe.v1.Failure`. */
  imports(): List<string> {
    return ["scribe/protocol/common.proto"];
  }

  /** The kind of statement a `Query` runs against its table. */
  @ProtoEnum()
  operation(): ProtoEnumBuilder {
    return this.builder((e) =>
      e.name("Operation").values((v) => [
        v.value("OPERATION_UNSPECIFIED").number(0),
        v.value("OPERATION_SELECT").number(1),
        v.value("OPERATION_INSERT").number(2),
        v.value("OPERATION_UPDATE").number(3),
        v.value("OPERATION_UPSERT").number(4),
        v.value("OPERATION_DELETE").number(5),
        v.value("OPERATION_RPC").number(6),
      ])
    );
  }

  /** How a `Filter` compares its column to its value. */
  @ProtoEnum()
  filterOperator(): ProtoEnumBuilder {
    return this.builder((e) =>
      e.name("FilterOperator").values((v) => [
        v.value("FILTER_OPERATOR_UNSPECIFIED").number(0),
        v.value("FILTER_OPERATOR_EQ").number(1),
        v.value("FILTER_OPERATOR_NEQ").number(2),
        v.value("FILTER_OPERATOR_GT").number(3),
        v.value("FILTER_OPERATOR_GTE").number(4),
        v.value("FILTER_OPERATOR_LT").number(5),
        v.value("FILTER_OPERATOR_LTE").number(6),
        v.value("FILTER_OPERATOR_LIKE").number(7),
        v.value("FILTER_OPERATOR_ILIKE").number(8),
        v.value("FILTER_OPERATOR_IN").number(9),
        v.value("FILTER_OPERATOR_IS").number(10),
        v.value("FILTER_OPERATOR_CONTAINS").number(11),
        v.value("FILTER_OPERATOR_CONTAINED_BY").number(12),
        v.value("FILTER_OPERATOR_OVERLAPS").number(13),
        v.value("FILTER_OPERATOR_TEXT_SEARCH").number(14),
      ])
    );
  }

  /** One column compared to one value, with the operator that relates them. */
  @ProtoMessage()
  filter(): ProtoMessageBuilder {
    return this.builder("Filter").fields((f) => ({
      column: f.string().number(1),
      operator: f.enum("FilterOperator").number(2),
      value: f.message("scribe.v1.Json").number(3),
      negated: f.bool().number(4),
    }));
  }

  /** A tree of filters and nested groups, joined by conjunction or disjunction. */
  @ProtoMessage()
  filterGroup(): ProtoMessageBuilder {
    return this.builder("FilterGroup").fields((f) => ({
      filters: f.message("Filter").repeated().number(1),
      groups: f.message("FilterGroup").repeated().number(2),
      disjunction: f.bool().number(3),
    }));
  }

  /** One column a `Query` sorts by, and the direction nulls fall on. */
  @ProtoMessage()
  order(): ProtoMessageBuilder {
    return this.builder("Order").fields((f) => ({
      column: f.string().number(1),
      descending: f.bool().number(2),
      nullsFirst: f.bool().number(3),
    }));
  }

  /** The page of a result a `Query` asks for. */
  @ProtoMessage()
  range(): ProtoMessageBuilder {
    return this.builder("Range").fields((f) => ({
      limit: f.uint32().number(1),
      offset: f.uint32().number(2),
    }));
  }

  /** One statement to run against PostgREST: a table, an operation, and everything that shapes it. */
  @ProtoMessage()
  query(): ProtoMessageBuilder {
    return this.builder("Query").fields((f) => ({
      table: f.string().number(1),
      operation: f.enum("Operation").number(2),
      select: f.string().repeated().number(3),
      where: f.message("FilterGroup").number(4),
      order: f.message("Order").repeated().number(5),
      range: f.message("Range").number(6),
      single: f.bool().number(7),
      countExact: f.bool().number(8),
      payload: f.message("scribe.v1.Json").number(9),
      onConflict: f.string().repeated().number(10),
      rpcName: f.string().number(11),
      rpcArgs: f.message("scribe.v1.Json").number(12),
    }));
  }

  /** What `Database.Execute` answers: the rows, the exact count when it was asked for, or a failure. */
  @ProtoMessage()
  queryResult(): ProtoMessageBuilder {
    return this.builder("QueryResult").fields((f) => ({
      data: f.message("scribe.v1.Json").number(1),
      count: f.uint64().number(2),
      error: f.message("scribe.v1.Failure").number(3),
    }));
  }

  /** What `Database.ExecuteBatch` takes: several queries to run together. */
  @ProtoMessage()
  queryBatch(): ProtoMessageBuilder {
    return this.builder("QueryBatch").fields((f) => ({
      queries: f.message("Query").repeated().number(1),
    }));
  }

  /** What `Database.ExecuteBatch` answers: one result per query, in the order it was asked. */
  @ProtoMessage()
  queryResultBatch(): ProtoMessageBuilder {
    return this.builder("QueryResultBatch").fields((f) => ({
      results: f.message("QueryResult").repeated().number(1),
    }));
  }

  /** `Execute` and `ExecuteBatch`, the two procedures a worker calls PostgREST with. */
  @ProtoService()
  database(): ProtoServiceBuilder {
    return this.builder("Database").rpc((r) => [
      r.name("Execute").request("Query").response("QueryResult"),
      r.name("ExecuteBatch").request("QueryBatch").response("QueryResultBatch"),
    ]);
  }
}
