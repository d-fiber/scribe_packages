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

const PLAIN_COLUMN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const IS_KEYWORDS: readonly string[] = ["null", "true", "false", "unknown"];

export class UnsafeFilterError extends Error {
  constructor(readonly detail: string) {
    super(`refusing to build a PostgREST filter: ${detail}`);
    this.name = "UnsafeFilterError";
  }
}

export function assertPlainColumn(column: string): string {
  if (!PLAIN_COLUMN.test(column)) {
    throw new UnsafeFilterError(`"${column}" is not a plain column name`);
  }
  return column;
}

export function quoteFilterLiteral(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return String(value);

  const text = typeof value === "number" || typeof value === "bigint"
    ? String(value)
    : typeof value === "string"
    ? value
    : JSON.stringify(value);

  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function isFilterKeyword(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "boolean") return true;
  return typeof value === "string" &&
    IS_KEYWORDS.includes(value.toLowerCase());
}

export function keywordLiteral(value: unknown): string {
  if (value === null || value === undefined) return "null";
  return String(value).toLowerCase();
}

export function quoteFilterList(values: readonly unknown[]): string {
  return `(${values.map(quoteFilterLiteral).join(",")})`;
}
