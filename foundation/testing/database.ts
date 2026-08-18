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

// deno-lint-ignore-file no-explicit-any
import "@scribe/core/testing/settings.ts";

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

  rows(name: string): Row[] {
    return this.#table(name).rows;
  }

  seed(name: string, rows: Row[]): void {
    this.#tables.set(name, new FakeTable(rows.map((row) => ({ ...row }))));
  }

  onRpc(fn: string, handler: RpcHandler): void {
    this.#rpcHandlers.set(fn, handler);
  }

  from(name: string) {
    const table = this.#table(name);
    return {
      select: (cols?: string) => new FakeQueryBuilder(table, "select").select(cols),
      insert: (data: Row | Row[]) => new FakeQueryBuilder(table, "insert", data),
      update: (data: Row) => new FakeQueryBuilder(table, "update", data),
      delete: () => new FakeQueryBuilder(table, "delete"),
    };
  }

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
