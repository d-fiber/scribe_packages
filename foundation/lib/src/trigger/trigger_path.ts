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

import { DeclarationError } from "@scribe/alchemy";
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
 * What a table, a parameter and a column may be spelled with.
 *
 * @remarks
 * Every segment of a path becomes something else's name: a table reaches PostgREST, a column is
 * compared against a row's keys, and both end up in the queue subject the declaration publishes
 * on. A segment carrying a comma, an ampersand or a blank is one of those names carrying syntax
 * that the thing reading it will act on.
 */
const NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

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
    throw new DeclarationError(`Trigger("${path}"): a path is written ${SHAPE}`);
  }

  const [table, param, field] = segments;

  if (table.length === 0) {
    throw new DeclarationError(`Trigger("${path}"): the table is missing, a path is written ${SHAPE}`);
  }

  if (!NAME.test(table)) {
    throw new DeclarationError(
      `Trigger("${path}"): "${table}" is not a table name, a path is written ${SHAPE}`,
    );
  }

  if (
    !param.startsWith("{") || !param.endsWith("}") || !NAME.test(param.slice(1, -1))
  ) {
    throw new DeclarationError(
      `Trigger("${path}"): "${param}" is not a parameter, a path is written ${SHAPE}`,
    );
  }

  if (field !== undefined && field.trim().length === 0) {
    throw new DeclarationError(`Trigger("${path}"): the field is empty, a path is written ${SHAPE}`);
  }

  if (field !== undefined && !NAME.test(field)) {
    throw new DeclarationError(
      `Trigger("${path}"): "${field}" is not a column, a path is written ${SHAPE}`,
    );
  }

  return { table, param: param.slice(1, -1), field: field ?? null };
}
