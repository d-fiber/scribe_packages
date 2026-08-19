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

import { triggerRegistry } from "../core/registry.ts";
import { triggerSources } from "./tables.ts";

/**
 * Makes `__trigger_sources__` say what this process declares, and answers what it wrote.
 *
 * This is the whole of what a declaration installs: the SQL trigger is already on every table
 * of `public`, and it writes nothing for a table this table does not name. Nothing here runs
 * DDL, so the process needs no privilege beyond the writes it already makes.
 *
 * The difference is applied row by row rather than by emptying the table first. Emptying it
 * would open a window, however short, during which every table stops emitting, and a write
 * that lands in that window is not replayed by anything.
 */
export async function syncDeclaredSources(): Promise<number> {
  const declared = triggerRegistry.sources();
  const current = await triggerSources().get();
  const known = new Map(current.map((row) => [row.table_name, row.key_column]));

  for (const source of declared) {
    const key = known.get(source.table_name);

    if (key === undefined) {
      await triggerSources().insert(source);
      continue;
    }

    if (key !== source.key_column) {
      await triggerSources()
        .where((f) => f.table_name.eq(source.table_name))
        .update({ key_column: source.key_column });
    }
  }

  const declaredTables = new Set(declared.map((source) => source.table_name));
  const dropped = current
    .filter((row) => !declaredTables.has(row.table_name))
    .map((row) => row.table_name);

  if (dropped.length > 0) {
    await triggerSources().where((f) => f.table_name.in(dropped)).delete();
  }

  return declared.length;
}
