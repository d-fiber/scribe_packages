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

import { PostgrestClients } from "@scribe/foundation/src/database/client.ts";
import { Table } from "@scribe/foundation/src/database/table.ts";
import { TablesBase } from "@scribe/foundation/src/database/tables.ts";

/** Any table of the project, seen as a bag of columns because this package knows no schema. */
type ProjectSchema = Record<string, { row: Record<string, unknown> }>;

/** A handle on a table the project owns, named at runtime by a declaration. */
class ProjectTable extends Table<ProjectSchema, string> {}

/** The Postgres functions this package ships, reached by name. */
class SearchFunctions extends TablesBase {}

const functions = new SearchFunctions(() => PostgrestClients.service());

/**
 * Reads `columns` for every row of `table` whose `key` is one of `ids`.
 *
 * @remarks
 * It is the one place this package reads a table it does not own, and it reads it with a raw
 * select because the list of columns was compiled from a declaration rather than written. The
 * service client is used deliberately: a document is built from everything a row holds, not
 * from what the caller who triggered the rebuild is allowed to see.
 */
export function projectRows(
  table: string,
  key: string,
  columns: string,
  ids: readonly string[],
): Promise<Record<string, unknown>[]> {
  return new ProjectTable(table)
    .selectRaw<Record<string, unknown>>(columns)
    .where((f) => f[key].in([...ids]))
    .get();
}

/** Calls the Postgres function `name`, and answers what it returned. */
export async function call<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await functions.rpc(name, args) as { data: unknown; error: unknown };

  if (error) {
    console.error(`[search:db] ${name} failed:`, error);
    return null;
  }

  return data as T;
}
