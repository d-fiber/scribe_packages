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

import { PreviewEmbed, type PreviewShape } from "./selector.ts";

/** What one preview declaration produces. */
export interface CompiledPreview {
  /** The select list the loader reads with. */
  readonly columns: string;

  /** Turns one answered row into the shape the declaration asked for. */
  build(row: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Turns one preview declaration into the select list and the reshaping that follows it.
 *
 * @remarks
 * A preview groups columns the way a caller wants to read them, and PostgREST answers a flat
 * row per table. Every leaf is therefore aliased to the path that leads to it, joined by two
 * underscores, and the reshaping puts it back where the declaration wrote it. The alias is
 * unique inside its own select, so two branches may read the same column under two names.
 *
 * @param first - The columns to select whatever the declaration reads, which is the key the
 * hydration keys its map on.
 */
export function compilePreview(shape: PreviewShape, first: readonly string[]): CompiledPreview {
  return {
    columns: selectOf(shape, first, []),
    build: (row) => buildFrom(shape, row, []),
  };
}

/** The alias a leaf at `path` is answered under. */
function aliasOf(path: readonly string[]): string {
  return path.join("__");
}

/** The select list `shape` reads, with `first` at the front. */
function selectOf(
  shape: PreviewShape,
  first: readonly string[],
  path: readonly string[],
): string {
  const parts = [...first];

  for (const [field, declared] of Object.entries(shape)) {
    const here = [...path, field];

    if (declared instanceof PreviewEmbed) {
      const relation = declared.inner ? `${declared.relation}!inner` : declared.relation;
      const named = field === declared.relation ? relation : `${field}:${relation}`;
      parts.push(`${named}(${selectOf(declared.shape, [], [])})`);
      continue;
    }

    if (typeof declared === "string") {
      const alias = aliasOf(here);
      parts.push(alias === declared ? declared : `${alias}:${declared}`);
      continue;
    }

    parts.push(selectOf(declared as PreviewShape, [], here));
  }

  return [...new Set(parts.filter((part) => part !== ""))].join(", ");
}

/** Puts every answered column back where `shape` wrote it. */
function buildFrom(
  shape: PreviewShape,
  row: Record<string, unknown>,
  path: readonly string[],
): Record<string, unknown> {
  const built: Record<string, unknown> = {};

  for (const [field, declared] of Object.entries(shape)) {
    const here = [...path, field];

    if (declared instanceof PreviewEmbed) {
      const value = row[field] ?? null;
      const rows = Array.isArray(value) ? value : value === null ? [] : [value];
      const read = rows.map((one) => buildFrom(declared.shape, one as Record<string, unknown>, []));

      built[field] = declared.many ? read : read[0] ?? null;
      continue;
    }

    built[field] = typeof declared === "string"
      ? row[aliasOf(here)] ?? null
      : buildFrom(declared as PreviewShape, row, here);
  }

  return built;
}
