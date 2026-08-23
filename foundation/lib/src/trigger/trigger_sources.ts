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

import type { Future } from "@scribe/alchemy";
import { triggerRegistry } from "./trigger_registry.ts";
import { triggerSources } from "./trigger_tables.ts";

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
export async function syncDeclaredSources(): Future<number> {
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
