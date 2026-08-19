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

/** The table a path names, which is everything before the first slash. */
export type TableOf<P extends string> = P extends `${infer T}/{${string}}${string}` ? T : never;

/**
 * The parameter a path binds, as the object a body reads it from.
 *
 * `"orders/{orderId}"` gives `{ orderId: string }`, so a body that misspells the name does not
 * compile. The value is always a string because it is the primary key as the row carries it,
 * read out of JSON and never cast.
 */
export type ParamsOf<P extends string> = P extends `${string}/{${infer K}}${string}` ? { readonly [_ in K]: string }
  : never;

/**
 * The field a path ends on, when it names one.
 *
 * It is intersected with the columns of `TRow`, so `"orders/{orderId}/statuz"` resolves to
 * `never` and the declaration does not compile.
 */
export type FieldOf<TRow, P extends string> = P extends `${string}/{${string}}/${infer F}` ? F & keyof TRow & string
  : never;

/** What a path says, once read. */
export interface ParsedPath {
  /** The table to observe. */
  readonly table: string;

  /** The name the primary key is handed to the body under. */
  readonly param: string;

  /** The column to watch, or null when the path stops at the row. */
  readonly field: string | null;
}

/** How a path is written, quoted in the error a bad one raises. */
const SHAPE = "<table>/{<param>}[/<field>]";

/**
 * Reads a declaration path, and refuses one the type system let through.
 *
 * The types in this file describe a path to the compiler, but a project can still hand over a
 * `string` that widened somewhere along the way. This is the same check at runtime, and it runs
 * at declaration time so a malformed path stops the process rather than a request.
 */
export function parsePath(path: string): ParsedPath {
  const segments = path.split("/");

  if (segments.length < 2 || segments.length > 3) {
    throw new Error(`Trigger("${path}"): a path is written ${SHAPE}`);
  }

  const [table, param, field] = segments;

  if (table.length === 0) {
    throw new Error(`Trigger("${path}"): the table is missing, a path is written ${SHAPE}`);
  }

  if (!param.startsWith("{") || !param.endsWith("}") || param.length <= 2) {
    throw new Error(
      `Trigger("${path}"): "${param}" is not a parameter, a path is written ${SHAPE}`,
    );
  }

  if (field !== undefined && field.length === 0) {
    throw new Error(`Trigger("${path}"): the field is empty, a path is written ${SHAPE}`);
  }

  return { table, param: param.slice(1, -1), field: field ?? null };
}
