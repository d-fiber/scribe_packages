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

import type { UnmodifiableList } from "@scribe/alchemy";
const PLAIN_COLUMN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const IS_KEYWORDS: UnmodifiableList<string> = ["null", "true", "false", "unknown"];

/**
 * Raised when a filter would build a PostgREST query string unsafe to send as written.
 *
 * @remarks
 * PostgREST reads a filter's column and value out of a plain, comma-and-operator-delimited query
 * string, not a parameterized query the way a raw SQL client would: there is no bound-value escape
 * hatch here, so this module's whole job is refusing anything that could not be safely spliced into
 * that string, and this is the one error every refusal raises.
 */
export class UnsafeFilterError extends Error {
  constructor(readonly detail: string) {
    super(`refusing to build a PostgREST filter: ${detail}`);
    this.name = "UnsafeFilterError";
  }
}

/**
 * Answers `column` back once it matches `PLAIN_COLUMN`, or throws.
 *
 * @remarks
 * A column name reaches PostgREST unquoted, right next to the operator and the value in the same
 * query string, so a column that carried a comma or an operator character of its own would not
 * filter on a different column, it would change which operator the query runs or add a second
 * filter the caller never asked for. This is the one place that risk is closed off, before a
 * column name is ever used to build part of a filter.
 *
 * @throws {UnsafeFilterError} When `column` is not a plain identifier.
 */
export function assertPlainColumn(column: string): string {
  if (!PLAIN_COLUMN.test(column)) {
    throw new UnsafeFilterError(`"${column}" is not a plain column name`);
  }
  return column;
}

/**
 * `value` as PostgREST's filter syntax expects it to be written.
 *
 * @remarks
 * `null`, a boolean, and a finite number are written bare, because PostgREST reads those forms
 * back as themselves; anything else is quoted, with an embedded quote or backslash escaped, so a
 * string value cannot be mistaken for the end of the literal and used to inject a second filter
 * term into the query string.
 */
export function quoteFilterLiteral(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return String(value);

  if (typeof value === "bigint") return String(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);

  const text = typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value);

  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** Whether `value` is one of the four literal keywords PostgREST's `is` operator accepts, rather than an ordinary value `quoteFilterLiteral` would quote. */
export function isFilterKeyword(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "boolean") return true;
  return typeof value === "string" &&
    IS_KEYWORDS.includes(value.toLowerCase());
}

/**
 * The keyword `value` stands for, as the `is` operator takes it.
 *
 * @remarks
 * The four keywords are the whole of what `is` accepts, so anything else is refused here rather
 * than passed on. It is not a matter of taste: what this answers is spliced into a filter string
 * unquoted, and a comma is what separates two terms of an `or` group, so a value carrying one
 * would add a disjunction the caller never wrote and widen what the query answers.
 *
 * {@link quoteFilterLiteral} is what a value that is not a keyword goes through, and it quotes.
 *
 * @throws {UnsafeFilterError} When `value` is not one of the four keywords `is` accepts.
 */
export function keywordLiteral(value: unknown): string {
  if (!isFilterKeyword(value)) {
    throw new UnsafeFilterError(
      `${JSON.stringify(String(value))} is not one of ${IS_KEYWORDS.join(", ")}`,
    );
  }
  if (value === null || value === undefined) return "null";
  return String(value).toLowerCase();
}

/** `values`, each quoted through {@link quoteFilterLiteral}, joined the way PostgREST's `in` operator expects a list. */
export function quoteFilterList(values: UnmodifiableList<unknown>): string {
  return `(${values.map(quoteFilterLiteral).join(",")})`;
}
