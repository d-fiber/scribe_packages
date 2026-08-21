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

/**
 * One column of `Row`, carried as its own name.
 *
 * It is a string at runtime, which is what a selection is compiled out of, and it keeps the row
 * it came from in its type so a shape written over it resolves to the values that row holds.
 */
export type Column<Row extends object, K extends keyof Row & string> = string & {
  /** The row this column belongs to. Never set: it exists so the type can be read back. */
  readonly __row: Row;

  /** The name of this column. Never set: it exists so the type can be read back. */
  readonly __key: K;
};

/** What a read declaration writes for one table: a column of it, or a table folded into it. */
export type ReadShape = Record<string, unknown>;

/** What a sign-up declaration writes for one table: who fills each of its columns. */
export type WriteShape = Record<string, unknown>;

/** A table folded into a read, and the shape it is projected by. */
export interface Embedded<Shape extends ReadShape> {
  /** Always "read", which is what tells a folded table apart from one a sign-up writes into. */
  readonly kind: "read";

  /** The table being folded in, addressed by the foreign key that points at the account. */
  readonly table: string;

  /** What is read from it. */
  readonly fields: Shape;
}

/** A table a sign-up writes a row into, and who fills each of its columns. */
export interface Written<Shape extends WriteShape> {
  /** Always "write", which is what tells a table written into apart from one folded into a read. */
  readonly kind: "write";

  /** The table the row goes into. */
  readonly table: string;

  /** What fills each column of that row. */
  readonly fields: Shape;
}

/** A column the caller has to fill for the account to be created. */
export interface RequiredValue<T> {
  /** Always true, which is what tells this apart from a column the caller may leave out. */
  readonly required: true;

  /** The column this value is written to. */
  readonly column: string;

  /** What the column holds. Never set: it exists so the type can be read back. */
  readonly __value: T;
}

/** A column the caller may fill, left to whatever the table defaults it to when they do not. */
export interface OptionalValue<T> {
  /** Always false, which is what tells this apart from a column the caller has to fill. */
  readonly required: false;

  /** The column this value is written to. */
  readonly column: string;

  /** What the column holds. Never set: it exists so the type can be read back. */
  readonly __value: T;
}

type ReadValue<V> = V extends Embedded<infer S> ? ReadOf<S> | null
  : V extends Column<infer Row, infer K> ? Row[K]
  : never;

/** What a read declaration answers with, derived from the shape it was written as. */
export type ReadOf<S> = { [K in keyof S]: ReadValue<S[K]> };

type WriteValue<V> = V extends Written<infer S> ? WriteOf<S>
  : V extends RequiredValue<infer T> ? T
  : V extends OptionalValue<infer T> ? T
  : never;

type OmittableKeys<S> = {
  [K in keyof S]: S[K] extends OptionalValue<unknown> ? K : never;
}[keyof S];

/** What a sign-up declaration asks its caller for, derived from the shape it was written as. */
export type WriteOf<S> =
  & { [K in Exclude<keyof S, OmittableKeys<S>>]: WriteValue<S[K]> }
  & { [K in OmittableKeys<S>]?: WriteValue<S[K]> };

/** The columns of one table, and the tables that hang off it, as a read declaration sees them. */
export type ReadSelector<Row extends object> =
  & { readonly [K in keyof Row & string]: Column<Row, K> }
  & {
    /**
     * Folds `table` into the read, projected by the shape the builder writes.
     *
     * The row on the far side is annotated on the builder rather than passed as a type argument,
     * because the shape has to stay inferred: it is what the answer's type is read from, and
     * naming one of the two would mean naming the other by hand.
     */
    readonly embed: <SubRow extends object, S extends ReadShape>(
      table: string,
      builder: (s: ReadSelector<SubRow>) => S,
    ) => Embedded<S>;
  };

/** The columns of one table, and the tables written beside it, as a sign-up declaration sees them. */
export type WriteSelector<Row extends object> =
  & { readonly [K in keyof Row & string]: Column<Row, K> }
  & {
    /** Writes a row into `table`, filled by the shape the builder writes. */
    readonly embed: <SubRow extends object, S extends WriteShape>(
      table: string,
      builder: (s: WriteSelector<SubRow>) => S,
    ) => Written<S>;
  };

/** The column the caller has to fill, refused by the compiler when they leave it out. */
export function Required<Row extends object, K extends keyof Row & string>(
  column: Column<Row, K>,
): RequiredValue<Row[K]> {
  return { required: true, column: String(column) } as RequiredValue<Row[K]>;
}

/**
 * The column the caller may fill, which is also what an entry with no wrapper means.
 *
 * It does nothing at runtime. It exists so a declaration can show every field it accepts rather
 * than leaving the omitted ones to be read as an oversight.
 */
export function Optional<Row extends object, K extends keyof Row & string>(
  column: Column<Row, K>,
): OptionalValue<Row[K]> {
  return { required: false, column: String(column) } as OptionalValue<Row[K]>;
}

/** Whether `value` is a table folded into a read. */
export function isEmbedded(value: unknown): value is Embedded<ReadShape> {
  return typeof value === "object" && value !== null && (value as Embedded<ReadShape>).kind === "read";
}

/** Whether `value` is a table a sign-up writes a row into. */
export function isWritten(value: unknown): value is Written<WriteShape> {
  return typeof value === "object" && value !== null && (value as Written<WriteShape>).kind === "write";
}

/** Whether `value` is a column the caller fills, whether or not they have to. */
export function isFilled(value: unknown): value is RequiredValue<unknown> | OptionalValue<unknown> {
  return typeof value === "object" && value !== null && "required" in value;
}

/**
 * Compiles a read shape into what PostgREST reads as a selection.
 *
 * Every entry is aliased to the name the shape gave it, folded tables included, which is what
 * lets a declaration answer `firstname` from a column called `first_name` without a second pass
 * over the answer.
 */
export function compileRead(shape: ReadShape): string {
  return Object.entries(shape)
    .map(([alias, value]) =>
      isEmbedded(value) ? `${alias}:${value.table}(${compileRead(value.fields)})` : `${alias}:${String(value)}`
    )
    .join(",");
}

/** A selector over `Row` that answers each column with its own name, and folds tables in. */
export function readSelector<Row extends object>(): ReadSelector<Row> {
  const embed = (table: string, builder: (s: never) => ReadShape): Embedded<ReadShape> => ({
    kind: "read",
    table,
    fields: builder(readSelector() as never),
  });

  return new Proxy({ embed } as unknown as ReadSelector<Row>, {
    get: (target, key: string) => (key === "embed" ? Reflect.get(target, key) : key),
  });
}

/** A selector over `Row` that answers each column with its own name, and names tables written beside it. */
export function writeSelector<Row extends object>(): WriteSelector<Row> {
  const embed = (table: string, builder: (s: never) => WriteShape): Written<WriteShape> => ({
    kind: "write",
    table,
    fields: builder(writeSelector() as never),
  });

  return new Proxy({ embed } as unknown as WriteSelector<Row>, {
    get: (target, key: string) => (key === "embed" ? Reflect.get(target, key) : key),
  });
}
