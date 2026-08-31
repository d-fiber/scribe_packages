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

// deno-lint-ignore-file no-explicit-any
import "./settings.ts";

export type Row = Record<string, unknown>;

class FakeTable {
  rows: Row[];

  constructor(rows: Row[] = []) {
    this.rows = rows;
  }
}

type Op = "select" | "insert" | "update" | "delete";

function likeToRegExp(pattern: string, insensitive = false): RegExp {
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*")
    .replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, insensitive ? "i" : undefined);
}

class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: null }> {
  readonly #table: FakeTable;
  readonly #op: Op;
  readonly #payload?: Row | Row[];
  readonly #filters: Array<(row: Row) => boolean> = [];
  readonly #orders: { col: string; ascending: boolean }[] = [];
  #limitCount: number | null = null;
  #rangeVal: [number, number] | null = null;
  #single = false;
  #returning: boolean;
  #selectCols: string[] | null = null;

  constructor(table: FakeTable, op: Op, payload?: Row | Row[]) {
    this.#table = table;
    this.#op = op;
    this.#payload = payload;
    this.#returning = op === "select";
  }

  select(cols?: string): this {
    this.#returning = true;
    this.#selectCols = cols && cols !== "*" && !cols.includes("(") ? cols.split(",").map((c) => c.trim()) : null;
    return this;
  }

  #project(row: Row): Row {
    if (!this.#selectCols) return row;
    const projected: Row = {};
    for (const col of this.#selectCols) {
      if (col in row) projected[col] = row[col];
    }
    return projected;
  }

  #filter(col: string, test: (value: unknown) => boolean): this {
    this.#filters.push((row) => test(row[col]));
    return this;
  }

  filter(col: string, operator: string, literal: string): this {
    if (operator === "in") return this.in(col, readFilterList(literal));

    const value = readFilterLiteral(literal);
    if (operator === "eq") return this.eq(col, value);
    if (operator === "neq") return this.neq(col, value);
    if (operator === "gt") return this.gt(col, value);
    if (operator === "gte") return this.gte(col, value);
    if (operator === "lt") return this.lt(col, value);
    if (operator === "lte") return this.lte(col, value);
    if (operator === "is") return this.is(col, value);
    if (operator === "like") return this.like(col, String(value));
    if (operator === "ilike") return this.ilike(col, String(value));
    throw new Error(`FakePostgrestClient: no operator named "${operator}"`);
  }

  eq(col: string, value: unknown): this {
    return this.#filter(col, (v) => v === value);
  }

  neq(col: string, value: unknown): this {
    return this.#filter(col, (v) => v !== value);
  }

  gt(col: string, value: unknown): this {
    return this.#filter(col, (v) => (v as any) > (value as any));
  }

  gte(col: string, value: unknown): this {
    return this.#filter(col, (v) => (v as any) >= (value as any));
  }

  lt(col: string, value: unknown): this {
    return this.#filter(col, (v) => (v as any) < (value as any));
  }

  lte(col: string, value: unknown): this {
    return this.#filter(col, (v) => (v as any) <= (value as any));
  }

  is(col: string, value: unknown): this {
    return this.#filter(col, (v) => v === value);
  }

  in(col: string, values: unknown[]): this {
    return this.#filter(col, (v) => values.includes(v));
  }

  like(col: string, pattern: string): this {
    return this.#filter(col, (v) => likeToRegExp(pattern).test(String(v ?? "")));
  }

  ilike(col: string, pattern: string): this {
    return this.#filter(col, (v) => likeToRegExp(pattern, true).test(String(v ?? "")));
  }

  order(col: string, options?: { ascending?: boolean }): this {
    this.#orders.push({ col, ascending: options?.ascending ?? true });
    return this;
  }

  limit(count: number): this {
    this.#limitCount = count;
    return this;
  }

  range(from: number, to: number): this {
    this.#rangeVal = [from, to];
    return this;
  }

  maybeSingle(): this {
    this.#single = true;
    return this;
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: {
        data: unknown;
        error: null;
      }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.#execute(), error: null as null }).then(
      onfulfilled,
      onrejected,
    );
  }

  #matched(): Row[] {
    return this.#table.rows.filter((row) => this.#filters.every((f) => f(row)));
  }

  #execute(): unknown {
    switch (this.#op) {
      case "select": {
        let rows = this.#matched();
        for (const { col, ascending } of [...this.#orders].reverse()) {
          rows = [...rows].sort((a, b) => {
            if (a[col] === b[col]) return 0;
            const cmp = (a[col] as any) > (b[col] as any) ? 1 : -1;
            return ascending ? cmp : -cmp;
          });
        }
        if (this.#rangeVal) {
          rows = rows.slice(this.#rangeVal[0], this.#rangeVal[1] + 1);
        }
        if (this.#limitCount !== null) rows = rows.slice(0, this.#limitCount);
        const projected = rows.map((row) => this.#project(row));
        return this.#single ? (projected[0] ?? null) : projected;
      }
      case "insert": {
        const items = (
          Array.isArray(this.#payload) ? this.#payload : [this.#payload!]
        ).map((item) => ({ ...item }));
        this.#table.rows.push(...items);
        const projected = items.map((row) => this.#project(row));
        if (this.#single) return projected[0] ?? null;
        return this.#returning ? projected : null;
      }
      case "update": {
        const rows = this.#matched();
        for (const row of rows) Object.assign(row, this.#payload);
        const projected = rows.map((row) => this.#project(row));
        if (this.#single) return projected[0] ?? null;
        return this.#returning ? projected : null;
      }
      case "delete": {
        const rows = this.#matched();
        this.#table.rows = this.#table.rows.filter(
          (row) => !rows.includes(row),
        );
        const projected = rows.map((row) => this.#project(row));
        if (this.#single) return projected[0] ?? null;
        return this.#returning ? projected : null;
      }
    }
  }
}

export type FakePostgrestSeed = Record<string, Row[]>;
export type RpcHandler = (args?: Record<string, unknown>) => unknown;

/**
 * A PostgREST client that keeps every table in memory, standing in for the real one in a test.
 *
 * @remarks
 * `filter_builder.ts` calls `.filter(column, operator, literal)` on whatever client it is given,
 * the literal already encoded the way `quoteFilterLiteral` writes it for the wire. This class
 * decodes that same format in {@link readFilterLiteral} and {@link readFilterList}, so a test
 * exercises the real encoding path end to end instead of a query object nothing ever serializes.
 */
export class FakePostgrestClient {
  readonly #tables = new Map<string, FakeTable>();
  readonly #rpcHandlers = new Map<string, RpcHandler>();

  constructor(seed: FakePostgrestSeed = {}) {
    for (const [name, rows] of Object.entries(seed)) this.seed(name, rows);
  }

  #table(name: string): FakeTable {
    let table = this.#tables.get(name);
    if (!table) {
      table = new FakeTable();
      this.#tables.set(name, table);
    }
    return table;
  }

  /** Every row currently held under table `name`. */
  rows(name: string): Row[] {
    return this.#table(name).rows;
  }

  /** Replaces table `name`'s rows with `rows`. */
  seed(name: string, rows: Row[]): void {
    this.#tables.set(name, new FakeTable(rows.map((row) => ({ ...row }))));
  }

  /** Wires `handler` to answer calls to the RPC named `fn`. */
  onRpc(fn: string, handler: RpcHandler): void {
    this.#rpcHandlers.set(fn, handler);
  }

  /** The query builder for table `name`, the same surface the real PostgREST client exposes. */
  from(name: string) {
    const table = this.#table(name);
    return {
      select: (cols?: string) => new FakeQueryBuilder(table, "select").select(cols),
      insert: (data: Row | Row[]) => new FakeQueryBuilder(table, "insert", data),
      update: (data: Row) => new FakeQueryBuilder(table, "update", data),
      delete: () => new FakeQueryBuilder(table, "delete"),
    };
  }

  /** Calls the handler wired to `fn` with `args`, or answers `null` when nothing was wired. */
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: null }> {
    const handler = this.#rpcHandlers.get(fn);
    return Promise.resolve({
      data: handler ? handler(args) : null,
      error: null,
    });
  }
}

/** Decodes one value out of the quoted, escaped form `quoteFilterLiteral` writes for the wire. */
function readFilterLiteral(literal: string): unknown {
  if (literal === "null") return null;
  if (literal === "unknown") return undefined;
  if (literal === "true") return true;
  if (literal === "false") return false;
  if (!literal.startsWith('"')) {
    const asNumber = Number(literal);
    return literal !== "" && Number.isFinite(asNumber) ? asNumber : literal;
  }

  let read = "";
  for (let at = 1; at < literal.length - 1; at++) {
    read += literal[at] === "\\" ? literal[++at] : literal[at];
  }
  return read;
}

/** Decodes the parenthesized, comma-separated form `quoteFilterList` writes for an `in` filter. */
function readFilterList(literal: string): unknown[] {
  const members: string[] = [];
  let member = "";
  let quoted = false;

  for (let at = 1; at < literal.length - 1; at++) {
    const char = literal[at];
    if (quoted && char === "\\") {
      member += char + literal[++at];
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (char === "," && !quoted) {
      members.push(member);
      member = "";
      continue;
    }
    member += char;
  }
  members.push(member);

  return members.map(readFilterLiteral);
}
