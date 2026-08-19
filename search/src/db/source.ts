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
