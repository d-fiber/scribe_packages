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

// deno-lint-ignore-file no-explicit-any

import { ownerOf } from "../schema.ts";
import type { FilterBuilder, FilterSpec } from "./filter.ts";
import { filter } from "./filter.ts";
import type { ScopeDecision } from "./scope.ts";
import { ownerScope } from "./scope.ts";
import type { ExtractShape, RelNode, Selector } from "./selector.ts";
import { columnsOf, selector } from "./selector.ts";
import type { QueryState } from "./state.ts";
import { atMostOneRow, buildRead, buildWrite, DEFAULT_STATE } from "./state.ts";

const OPEN_SCOPE: ScopeDecision = { kind: "open" };

const MAX_CAUSE_CHARS = 300;

function describeCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;

  let text: string;
  try {
    text = JSON.stringify(cause) ?? String(cause);
  } catch {
    text = String(cause);
  }

  return text.length > MAX_CAUSE_CHARS ? `${text.slice(0, MAX_CAUSE_CHARS)}…` : text;
}

export class DatabaseQueryError extends Error {
  constructor(
    readonly table: string,
    readonly operation: string,
    override readonly cause: unknown,
  ) {
    super(`[${operation}] ${table}: ${describeCause(cause)}`);
    this.name = "DatabaseQueryError";
  }
}

export class OwnerScopeError extends Error {
  constructor(readonly table: string, readonly column: string) {
    super(
      `${table} is owned by "${column}" and the caller is not an admin: refusing an unscoped query. ` +
        `Call .unscoped() if crossing owners is deliberate and authorised upstream.`,
    );
    this.name = "OwnerScopeError";
  }
}

/**
 * A PostgREST client, or a way to get one when it is first needed.
 *
 * A builder is routinely constructed at module load, as in `const users = new Database("users")`,
 * and building the client there would read the database settings before the boot has filled
 * them, which throws. Taking a thunk is what lets the two happen in either order.
 */
export type PostgrestClientSource = any | (() => any);

export class TypedQueryBuilder<
  Row extends object,
  Result = Row,
  Rels extends Record<string, RelNode> = Record<string, never>,
> {
  readonly #source: PostgrestClientSource;
  readonly #table: string;
  readonly #state: QueryState;

  #client: any = null;

  constructor(
    source: PostgrestClientSource,
    table: string,
    state: QueryState = DEFAULT_STATE,
  ) {
    this.#source = source;
    this.#table = table;
    this.#state = state;
  }

  /**
   * The PostgREST client, resolved once per builder and only when a query is compiled.
   *
   * Chaining passes the source along rather than the resolved client, so a chain built before
   * the boot filled the settings still works.
   */
  get #db(): any {
    return (this.#client ??= typeof this.#source === "function" ? this.#source() : this.#source);
  }

  #constrainsOwner(): boolean {
    const column = ownerOf(this.#table);
    return column !== null &&
      this.#state.filters.some((f) => f.column === column);
  }

  #decide(ownerAlreadyBound: boolean): ScopeDecision {
    if (this.#state.unscoped) return OPEN_SCOPE;

    const decision = ownerScope(this.#table);
    if (decision.kind !== "denied") return decision;
    if (ownerAlreadyBound) return OPEN_SCOPE;

    throw new OwnerScopeError(this.#table, decision.column);
  }

  #scoped(): { state: QueryState; owned: boolean } {
    const decision = this.#decide(this.#constrainsOwner());
    if (decision.kind !== "scoped") return { state: this.#state, owned: false };

    return {
      state: {
        ...this.#state,
        filters: [
          ...this.#state.filters,
          {
            column: decision.column,
            apply: (qb: any) => qb.eq(decision.column, decision.id),
          },
        ],
      },
      owned: true,
    };
  }

  #refusesUnboundedWrite(
    op: string,
    scoped: { state: QueryState; owned: boolean },
  ): boolean {
    if (this.#state.entireTable) return false;
    if (scoped.owned || scoped.state.filters.length > 0) return false;

    console.error(
      `[db-query:${op}] ${this.#table}: write with no predicate, refused. ` +
        `Add a .where(), or .entireTable() if touching every row is deliberate.`,
    );
    return true;
  }

  #failed(op: string, error: unknown): boolean {
    if (!error) return false;

    console.error(
      `[db-query:${op}] ${this.#table}: ${describeCause(error)}`,
    );
    return true;
  }

  #carriesOwner<T extends Partial<Row>>(data: T | T[]): boolean {
    const column = ownerOf(this.#table);
    if (column === null) return false;

    const rows = Array.isArray(data) ? data : [data];
    return rows.length > 0 &&
      rows.every((row) => {
        const value = (row as Record<string, unknown>)[column];
        return value !== undefined && value !== null;
      });
  }

  #owned<T extends Partial<Row>>(data: T | T[]): T | T[] {
    const decision = this.#decide(this.#carriesOwner(data));
    if (decision.kind !== "scoped") return data;

    const withOwner = (row: T): T => {
      const current = (row as Record<string, unknown>)[decision.column];
      return current === undefined || current === null ? { ...row, [decision.column]: decision.id } : row;
    };

    return Array.isArray(data) ? data.map(withOwner) : withOwner(data);
  }

  unscoped(): TypedQueryBuilder<Row, Result, Rels> {
    return this.#with({ unscoped: true });
  }

  entireTable(): TypedQueryBuilder<Row, Result, Rels> {
    return this.#with({ entireTable: true });
  }

  #with(state: Partial<QueryState>): TypedQueryBuilder<Row, Result, Rels> {
    return new TypedQueryBuilder<Row, Result, Rels>(this.#source, this.#table, {
      ...this.#state,
      ...state,
    });
  }

  selectRaw<R extends object = Row>(
    cols: string,
  ): TypedQueryBuilder<Row, R, Rels> {
    return new TypedQueryBuilder<Row, R, Rels>(this.#source, this.#table, {
      ...this.#state,
      selectCols: cols,
    });
  }

  select<const Shape extends Record<string, unknown>>(
    builder: (s: Selector<Row, Rels>) => Shape,
  ): TypedQueryBuilder<Row, ExtractShape<Row, Shape>, Rels> {
    const shape = builder(selector<Row, Rels>());
    return new TypedQueryBuilder(this.#source, this.#table, {
      ...this.#state,
      selectCols: columnsOf(shape),
    }) as any;
  }

  where(
    builder: (f: FilterBuilder<Row>) => FilterSpec | FilterSpec[],
  ): TypedQueryBuilder<Row, Result, Rels> {
    const specs = builder(filter<Row>());
    return this.#with({
      filters: [
        ...this.#state.filters,
        ...(Array.isArray(specs) ? specs : [specs]),
      ],
    });
  }

  order<K extends keyof Row & string>(
    column: K,
    options?: {
      ascending?: boolean;
      nullsFirst?: boolean;
      foreignTable?: string;
    },
  ): TypedQueryBuilder<Row, Result, Rels> {
    return this.#with({
      orders: [...this.#state.orders, { col: column, options }],
    });
  }

  limit(count: number): TypedQueryBuilder<Row, Result, Rels> {
    return this.#with({ limitCount: count });
  }

  range(from: number, to: number): TypedQueryBuilder<Row, Result, Rels> {
    return this.#with({ rangeVal: [from, to] });
  }

  async get(): Promise<Result[]> {
    const qb = buildRead(this.#db, this.#table, this.#scoped().state);
    const { data, error } = (await qb) as { data: unknown; error: unknown };

    if (error) throw new DatabaseQueryError(this.#table, "get", error);
    return (data ?? []) as Result[];
  }

  async getOne(): Promise<Result | null> {
    const qb = buildRead(
      this.#db,
      this.#table,
      atMostOneRow(this.#scoped().state),
    );
    const { data, error } = (await qb.maybeSingle()) as {
      data: unknown;
      error: unknown;
    };

    if (error) throw new DatabaseQueryError(this.#table, "getOne", error);
    return data as Result | null;
  }

  async insert(data: Partial<Row> | Partial<Row>[]): Promise<boolean> {
    const { error } = await this.#db
      .from(this.#table)
      .insert(this.#owned(data));
    return !this.#failed("insert", error);
  }

  async insertOne(data: Partial<Row>): Promise<Row | null> {
    const { data: result, error } = await this.#db
      .from(this.#table)
      .insert(this.#owned(data))
      .select("*")
      .maybeSingle();

    if (this.#failed("insertOne", error)) return null;
    return result as Row | null;
  }

  async update(data: Partial<Row>): Promise<boolean> {
    const scoped = this.#scoped();
    if (this.#refusesUnboundedWrite("update", scoped)) return false;

    const { error } = await buildWrite(
      this.#db,
      this.#table,
      scoped.state,
      "update",
      data,
    );
    return !this.#failed("update", error);
  }

  async delete(): Promise<boolean> {
    const scoped = this.#scoped();
    if (this.#refusesUnboundedWrite("delete", scoped)) return false;

    const { error } = await buildWrite(
      this.#db,
      this.#table,
      scoped.state,
      "delete",
    );
    return !this.#failed("delete", error);
  }

  async deleteOne(): Promise<Row | null>;
  async deleteOne<const Shape extends Record<string, unknown>>(
    builder: (s: Selector<Row, Rels>) => Shape,
  ): Promise<ExtractShape<Row, Shape> | null>;
  async deleteOne<const Shape extends Record<string, unknown>>(
    builder?: (s: Selector<Row, Rels>) => Shape,
  ): Promise<Row | ExtractShape<Row, Shape> | null> {
    const scoped = this.#scoped();
    if (this.#refusesUnboundedWrite("deleteOne", scoped)) return null;

    let qb = buildWrite(this.#db, this.#table, scoped.state, "delete");
    qb = builder ? qb.select(columnsOf(builder(selector<Row, Rels>()))) : qb.select("*");
    const { data, error } = await qb.maybeSingle();
    if (this.#failed("deleteOne", error)) return null;
    return data as any;
  }
}
