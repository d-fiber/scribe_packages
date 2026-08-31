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

import { Failure, type Future, Ok, Refusal, type Result } from "@scribe/alchemy";
import type { PostgrestClient } from "@supabase/postgrest-js";
import { log } from "@scribe/alchemy/observe";

import { ownerOf } from "../table_owners.ts";
import type { FilterBuilder, FilterSpec } from "./filter_builder.ts";
import { filter } from "./filter_builder.ts";
import { NOBODY, type ScopeDecision } from "./owner_scope.ts";
import { embeddedScopes, ownerScope } from "./owner_scope.ts";
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

  return text.length > MAX_CAUSE_CHARS ? `${text.slice(0, MAX_CAUSE_CHARS)}...` : text;
}

/** Raised when a query throws rather than answering a `Result`: a read failure, not a refused write. */
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
export type PostgrestClientSource = PostgrestClient | (() => PostgrestClient);

/**
 * A chainable, owner-scoped query over one table, compiled against PostgREST only when it runs.
 *
 * @remarks
 * Every chaining method returns a new builder rather than mutating this one, so a base query can
 * be shared and specialized without the branches interfering with each other. Reads throw a
 * {@link DatabaseQueryError} on failure; writes answer a `Result` instead, since a write has ways
 * of not happening that are worth telling apart, not just one failure to raise.
 */
export class TypedQueryBuilder<
  Row extends object,
  Answer = Row,
  Rels extends Record<string, RelNode> = Record<string, never>,
> {
  readonly #source: PostgrestClientSource;
  readonly #table: string;
  readonly #state: QueryState;

  #client: PostgrestClient | null = null;

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
  get #db(): PostgrestClient {
    return (this.#client ??= typeof this.#source === "function" ? this.#source() : this.#source);
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
    const embedded = embeddedScopes(this.#state.selectCols);

    if (decision.kind === "nobody") {
      return {
        state: {
          ...this.#state,
          filters: [
            ...this.#state.filters,
            ...embedded,
            // deno-lint-ignore no-explicit-any -- FilterSpec.apply takes the builder untyped, since its shape differs at each chained call.
            { column: decision.column, apply: (qb: any) => qb.eq(decision.column, NOBODY) },
          ],
        },
        owned: false,
      };
    }

    if (decision.kind !== "scoped") {
      return embedded.length === 0
        ? { state: this.#state, owned: false }
        : { state: { ...this.#state, filters: [...this.#state.filters, ...embedded] }, owned: false };
    }

    return {
      state: {
        ...this.#state,
        filters: [
          ...this.#state.filters,
          ...embedded,
          {
            column: decision.column,
            // deno-lint-ignore no-explicit-any -- see above: FilterSpec.apply takes the builder untyped.
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

  /**
   * Whether the store reported a failure, recording it when it did.
   *
   * @remarks
   * Anything present is a failure, including the empty string and zero. A store answering a
   * falsy error used to read as a write that happened, and the caller was told a row it never
   * wrote was written.
   */
  #failed(op: string, error: unknown): boolean {
    if (error === null || error === undefined) return false;

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

  /**
   * `data` with the owning column filled from the caller, or what naming another owner earns.
   *
   * @remarks
   * Filling a column nobody named and accepting one that names somebody else look alike from
   * inside a write, and they are opposites. The second plants a row in another caller's account,
   * where the read side will never show it to whoever wrote it, so it is refused rather than
   * quietly corrected: a caller who meant their own row left the column out.
   *
   * A caller who proved nobody owns nothing, so there is no column to fill and the write has no
   * owner to carry. It is refused for the same reason the read answers no row.
   */
  #owned<T extends Partial<Row>>(data: T | T[]): Result<T | T[]> {
    const decision = this.#decide();
    if (decision.kind === "nobody") return new Failure(_NO_OWNER);
    if (decision.kind !== "scoped") return new Ok(data);

    const rows = Array.isArray(data) ? data : [data];
    for (const row of rows) {
      const named = (row as Record<string, unknown>)[decision.column];
      if (named !== undefined && named !== null && named !== decision.id) {
        return new Failure(_FOREIGN_OWNER);
      }
    }

    const withOwner = (row: T): T => ({ ...row, [decision.column]: decision.id });
    return new Ok(Array.isArray(data) ? data.map(withOwner) : withOwner(data));
  }

  /**
   * What writing the owning column earns, or null when the write leaves it where it is.
   *
   * @remarks
   * The scope narrows an update to the caller's own rows and says nothing about what it writes.
   * Moving the owning column moves the row out of that scope for good, and the caller who did it
   * cannot read it back to undo it.
   */
  #movesTheOwner(data: Partial<Row>): Refusal | null {
    const decision = this.#decide();
    if (decision.kind !== "scoped") return null;

    const named = (data as Record<string, unknown>)[decision.column];
    return named === undefined || named === decision.id ? null : _FOREIGN_OWNER;
  }

  /** Reads or writes without the owner scope, for code that runs outside a caller's own request. */
  unscoped(): TypedQueryBuilder<Row, Answer, Rels> {
    return this.#with({ unscoped: true });
  }

  /** Allows a write with no `where` to reach every row, rather than being refused as unbounded. */
  entireTable(): TypedQueryBuilder<Row, Answer, Rels> {
    return this.#with({ entireTable: true });
  }

  #with(state: Partial<QueryState>): TypedQueryBuilder<Row, Answer, Rels> {
    return new TypedQueryBuilder<Row, Answer, Rels>(this.#source, this.#table, {
      ...this.#state,
      ...state,
    });
  }

  /** Selects `cols` as a raw PostgREST column list, for a shape {@link select}'s own selector cannot express. */
  selectRaw<R extends object = Row>(
    cols: string,
  ): TypedQueryBuilder<Row, R, Rels> {
    return new TypedQueryBuilder<Row, R, Rels>(this.#source, this.#table, {
      ...this.#state,
      selectCols: cols,
    });
  }

  /** Selects the shape `builder` describes, typed by what it picks off `Row` and its declared relations. */
  select<const Shape extends Record<string, unknown>>(
    builder: (s: Selector<Row, Rels>) => Shape,
  ): TypedQueryBuilder<Row, ExtractShape<Row, Shape>, Rels> {
    const shape = builder(selector<Row, Rels>());
    return new TypedQueryBuilder<Row, ExtractShape<Row, Shape>, Rels>(this.#source, this.#table, {
      ...this.#state,
      selectCols: columnsOf(shape),
    });
  }

  /** Adds the filters `builder` describes, on top of whatever this query already filters on. */
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

  /** Orders the result by `column`, ascending unless `options.ascending` says otherwise. */
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

  /**
   * Asks for at most `count` rows.
   *
   * @remarks
   * A count that is not a whole number of rows is dropped rather than sent. PostgREST reads the
   * value as text, so `NaN`, `Infinity` and `1.5` reach it as words it refuses the whole request
   * over, and a negative count asks for a window that cannot exist. Dropping it answers the
   * query unbounded, which is what the caller would have got had it never called this, and the
   * line says which call was ignored.
   */
  limit(count: number): TypedQueryBuilder<Row, Answer, Rels> {
    if (!_isRowCount(count)) {
      log.error("database.limit_ignored", {
        metadata: { table: this.#table, asked: count, consequence: "the query is not bounded" },
      });
      return this;
    }
    return this.#with({ limitCount: count });
  }

  /** Asks for rows `from` through `to`, inclusive, in the order the query would otherwise answer them. */
  range(from: number, to: number): TypedQueryBuilder<Row, Answer, Rels> {
    return this.#with({ rangeVal: [from, to] });
  }

  /** Runs this query and answers every row it reaches, scoped and shaped by whatever was chained. */
  async get(): Future<Answer[]> {
    const qb = buildRead(this.#db, this.#table, this.#scoped().state);
    const { data, error } = (await qb) as { data: unknown; error: unknown };

    if (error) throw new DatabaseQueryError(this.#table, "get", error);
    return (data ?? []) as Answer[];
  }

  /** Runs this query and answers its one row, or `null` when it reaches none. */
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
    const owned = this.#owned(data);
    if (!owned.ok) return owned;

    const rows = Array.isArray(data) ? data.length : 1;
    const { error } = await this.#db.from(this.#table).insert(owned.data);

    return this.#failed("insert", error) ? new Failure(_refusalOf(error)) : new Ok(rows);
  }

  /** Writes one row and answers it as the store wrote it, or what stopped the write. */
  async insertOne(data: Partial<Row>): Future<Result<Row>> {
    const owned = this.#owned(data);
    if (!owned.ok) return owned;

    const { data: result, error } = await this.#db
      .from(this.#table)
      .insert(owned.data)
      .select("*")
      .maybeSingle();

    if (this.#failed("insertOne", error)) return new Failure(_refusalOf(error));
    return result === null ? new Failure(Refusal.missing("the row was not written.")) : new Ok(result as Row);
  }

  /** Writes `data` over every row this query reaches, and answers what became of it. */
  async update(data: Partial<Row>): Future<Result<number>> {
    const moved = this.#movesTheOwner(data);
    if (moved !== null) return new Failure(moved);

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
    return Array.isArray(written) ? new Ok(written.length) : new Failure(_SILENT);
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
    return Array.isArray(removed) ? new Ok(removed.length) : new Failure(_SILENT);
  }

  /** Removes the one row this query reaches, and answers it as it was before. */
  async deleteOne(): Future<Result<Row>>;
  /** The same removal, answering the shape `builder` describes instead of the whole row. */
  async deleteOne<const Shape extends Record<string, unknown>>(
    builder: (s: Selector<Row, Rels>) => Shape,
  ): Future<Result<ExtractShape<Row, Shape>>>;
  /** The shared implementation behind both overloads above. */
  async deleteOne<const Shape extends Record<string, unknown>>(
    builder?: (s: Selector<Row, Rels>) => Shape,
  ): Future<Result<Row | ExtractShape<Row, Shape>>> {
    const scoped = this.#scoped();
    if (this.#refusesUnboundedWrite("deleteOne", scoped)) return new Failure(_UNBOUNDED);

    let qb = buildWrite(this.#db, this.#table, scoped.state, "delete");
    qb = builder ? qb.select(columnsOf(builder(selector<Row, Rels>()))) : qb.select("*");
    const { data, error } = await qb.maybeSingle();

    if (this.#failed("deleteOne", error)) return new Failure(_refusalOf(error));
    return data === null ? new Failure(Refusal.missing("no row matched.")) : new Ok(data as Row);
  }
}

/** What a caller who proved nobody earns for trying to write a row somebody would own. */
const _NO_OWNER: Refusal = Refusal.denied(
  "a caller that proved nobody owns no row, so it may not write one into an owned table.",
);

/** What naming an owner other than the caller earns, on a write or on an update. */
const _FOREIGN_OWNER: Refusal = Refusal.denied(
  "the owning column names another caller. Leave it out and it is filled from whoever is calling.",
);

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
  if (error === null || typeof error !== "object") {
    return Refusal.conflict(_saidBy(error));
  }

  const said = "message" in error ? String((error as { message: unknown }).message) : _NOTHING_SAID;
  return "code" in error ? Refusal.conflict(said) : Refusal.unavailable(said);
}

/** What a store said when what it answered was not an object holding a message. */
const _NOTHING_SAID = "the write did not happen.";

/**
 * What a store that answered something other than an object said.
 *
 * @remarks
 * A driver that answers a string or a code has still answered, so the call is refused rather than
 * called retryable: replaying a duplicate key will produce the same duplicate key. Losing the text
 * on the way is what left the caller a refusal with nothing in it to act on.
 */
function _saidBy(error: unknown): string {
  const said = String(error);
  return said === "" ? _NOTHING_SAID : said;
}

/** What is answered when the store wrote without saying what it wrote. */
const _SILENT: Refusal = Refusal.unavailable(
  "the store did not say which rows it wrote, so the count cannot be told from a write that matched nothing.",
);

/** Whether `count` is a number of rows a query can be asked for. */
function _isRowCount(count: number): boolean {
  return Number.isInteger(count) && count >= 0;
}
