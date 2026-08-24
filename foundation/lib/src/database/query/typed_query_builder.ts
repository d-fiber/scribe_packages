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

import { Failure, type Future, Ok, Refusal, type Result } from "@scribe/alchemy";
import { log } from "@scribe/alchemy/observe";

import { ownerOf } from "../table_owners.ts";
import type { FilterBuilder, FilterSpec } from "./filter_builder.ts";
import { filter } from "./filter_builder.ts";
import { NOBODY, type ScopeDecision } from "./owner_scope.ts";
import { ownerScope } from "./owner_scope.ts";
import type { ExtractShape, RelNode, Selector } from "./selector.ts";
import { columnsOf, selector } from "./selector.ts";
import type { QueryState } from "./query_state.ts";
import { atMostOneRow, buildRead, buildWrite, DEFAULT_STATE } from "./query_state.ts";

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

  return text.length > MAX_CAUSE_CHARS
    ? `${text.slice(0, MAX_CAUSE_CHARS)}...`
    : text;
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
  Answer = Row,
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
    return (this.#client ??= typeof this.#source === "function"
      ? this.#source()
      : this.#source);
  }

  #constrainsOwner(): boolean {
    const column = ownerOf(this.#table);
    return (
      column !== null && this.#state.filters.some((f) => f.column === column)
    );
  }

  /** What this query is allowed to see, once the caller and the table have both been read. */
  #decide(): ScopeDecision {
    return this.#state.unscoped ? OPEN_SCOPE : ownerScope(this.#table);
  }

  #scoped(): { state: QueryState; owned: boolean } {
    const decision = this.#decide();

    if (decision.kind === "nobody") {
      return {
        state: {
          ...this.#state,
          filters: [
            ...this.#state.filters,
            { column: decision.column, apply: (qb: any) => qb.eq(decision.column, NOBODY) },
          ],
        },
        owned: false,
      };
    }

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
    if (scoped.owned || this.#state.filters.length > 0) return false;

    log.error("db-query.unbounded_write_refused", {
      metadata: {
        operation: op,
        table: this.#table,
        remedy: "add a .where(), or .entireTable() if touching every row is deliberate",
      },
    });
    return true;
  }

  #failed(op: string, error: unknown): boolean {
    if (!error) return false;

    log.error("db-query.failed", {
      metadata: { operation: op, table: this.#table, cause: describeCause(error) },
    });
    return true;
  }

  #carriesOwner<T extends Partial<Row>>(data: T | T[]): boolean {
    const column = ownerOf(this.#table);
    if (column === null) return false;

    const rows = Array.isArray(data) ? data : [data];
    return (
      rows.length > 0 &&
      rows.every((row) => {
        const value = (row as Record<string, unknown>)[column];
        return value !== undefined && value !== null;
      })
    );
  }

  #owned<T extends Partial<Row>>(data: T | T[]): T | T[] {
    const decision = this.#decide();
    if (decision.kind !== "scoped") return data;

    const withOwner = (row: T): T => {
      const current = (row as Record<string, unknown>)[decision.column];
      return current === undefined || current === null
        ? { ...row, [decision.column]: decision.id }
        : row;
    };

    return Array.isArray(data) ? data.map(withOwner) : withOwner(data);
  }

  unscoped(): TypedQueryBuilder<Row, Answer, Rels> {
    return this.#with({ unscoped: true });
  }

  entireTable(): TypedQueryBuilder<Row, Answer, Rels> {
    return this.#with({ entireTable: true });
  }

  #with(state: Partial<QueryState>): TypedQueryBuilder<Row, Answer, Rels> {
    return new TypedQueryBuilder<Row, Answer, Rels>(this.#source, this.#table, {
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
  ): TypedQueryBuilder<Row, Answer, Rels> {
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
  ): TypedQueryBuilder<Row, Answer, Rels> {
    return this.#with({
      orders: [...this.#state.orders, { col: column, options }],
    });
  }

  limit(count: number): TypedQueryBuilder<Row, Answer, Rels> {
    return this.#with({ limitCount: count });
  }

  range(from: number, to: number): TypedQueryBuilder<Row, Answer, Rels> {
    return this.#with({ rangeVal: [from, to] });
  }

  async get(): Future<Answer[]> {
    const qb = buildRead(this.#db, this.#table, this.#scoped().state);
    const { data, error } = (await qb) as { data: unknown; error: unknown };

    if (error) throw new DatabaseQueryError(this.#table, "get", error);
    return (data ?? []) as Answer[];
  }

  async getOne(): Future<Answer | null> {
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
    return data as Answer | null;
  }

  /**
   * Writes `data`, and answers what became of it.
   *
   * @remarks
   * The outcome carries a refusal rather than a false, because a write has four ways of not
   * happening and only two of them are worth retrying. `unavailable` says the store could not be
   * reached, so the same call may work later; `conflict` says the store refused what was sent, so
   * it will not.
   */
  async insert(data: Partial<Row> | Partial<Row>[]): Future<Result<number>> {
    const rows = Array.isArray(data) ? data.length : 1;
    const { error } = await this.#db
      .from(this.#table)
      .insert(this.#owned(data));

    return this.#failed("insert", error) ? new Failure(_refusalOf(error)) : new Ok(rows);
  }

  /** Writes one row and answers it as the store wrote it, or what stopped the write. */
  async insertOne(data: Partial<Row>): Future<Result<Row>> {
    const { data: result, error } = await this.#db
      .from(this.#table)
      .insert(this.#owned(data))
      .select("*")
      .maybeSingle();

    if (this.#failed("insertOne", error)) return new Failure(_refusalOf(error));
    return result === null ? new Failure(Refusal.missing("the row was not written.")) : new Ok(result as Row);
  }

  /** Writes `data` over every row this query reaches, and answers what became of it. */
  async update(data: Partial<Row>): Future<Result<number>> {
    const scoped = this.#scoped();
    if (this.#refusesUnboundedWrite("update", scoped)) return new Failure(_UNBOUNDED);

    const { data: written, error } = await buildWrite(
      this.#db,
      this.#table,
      scoped.state,
      "update",
      data,
    ).select("*");

    if (this.#failed("update", error)) return new Failure(_refusalOf(error));
    return new Ok(Array.isArray(written) ? written.length : 0);
  }

  /** Removes every row this query reaches, and answers how many that was. */
  async delete(): Future<Result<number>> {
    const scoped = this.#scoped();
    if (this.#refusesUnboundedWrite("delete", scoped)) return new Failure(_UNBOUNDED);

    const { data: removed, error } = await buildWrite(
      this.#db,
      this.#table,
      scoped.state,
      "delete",
    ).select("*");

    if (this.#failed("delete", error)) return new Failure(_refusalOf(error));
    return new Ok(Array.isArray(removed) ? removed.length : 0);
  }

  /** Removes the one row this query reaches, and answers it as it was before. */
  async deleteOne(): Future<Result<Row>>;
  async deleteOne<const Shape extends Record<string, unknown>>(
    builder: (s: Selector<Row, Rels>) => Shape,
  ): Future<Result<ExtractShape<Row, Shape>>>;
  async deleteOne<const Shape extends Record<string, unknown>>(
    builder?: (s: Selector<Row, Rels>) => Shape,
  ): Future<Result<Row | ExtractShape<Row, Shape>>> {
    const scoped = this.#scoped();
    if (this.#refusesUnboundedWrite("deleteOne", scoped)) return new Failure(_UNBOUNDED);

    let qb = buildWrite(this.#db, this.#table, scoped.state, "delete");
    qb = builder
      ? qb.select(columnsOf(builder(selector<Row, Rels>())))
      : qb.select("*");
    const { data, error } = await qb.maybeSingle();

    if (this.#failed("deleteOne", error)) return new Failure(_refusalOf(error));
    return data === null ? new Failure(Refusal.missing("no row matched.")) : new Ok(data as Row);
  }
}

/** What a write that names no row is refused with, whatever the store would have done. */
const _UNBOUNDED: Refusal = Refusal.denied(
  "the write names no row. Add a .where(), or .entireTable() if reaching every row is deliberate.",
);

/**
 * What a store's failure means to a caller deciding whether to try again.
 *
 * @remarks
 * The two that matter are told apart by where the failure came from. A store that answered says
 * what it refused and will refuse it again, so the call is a conflict. A store that answered
 * nothing may answer next time, so the call is unavailable, and only that one is worth replaying.
 */
function _refusalOf(error: unknown): Refusal {
  const answered = error !== null && typeof error === "object" && "code" in error;
  const said = error !== null && typeof error === "object" && "message" in error
    ? String((error as { message: unknown }).message)
    : "the write did not happen.";

  return answered ? Refusal.conflict(said) : Refusal.unavailable(said);
}
