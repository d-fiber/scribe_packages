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

import { serviceToken, STACK } from "./stack.ts";

/**
 * Writes to the project's own tables the way a project writes to them, over PostgREST.
 *
 * @remarks
 * The suite has to move rows without going through the package, because moving them is what
 * the trigger reacts to. Reaching for the package's own handles would read the tables it owns
 * with the code under test, which is the one thing an end-to-end run must not do.
 */
async function request(
  method: string,
  table: string,
  query: string,
  body?: unknown,
): Promise<Response> {
  const token = await serviceToken();
  const answered = await fetch(`${STACK.restUrl}/${table}${query ? `?${query}` : ""}`, {
    method,
    headers: {
      apikey: token,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!answered.ok) {
    throw new Error(`${method} ${table} answered ${answered.status}: ${await answered.text()}`);
  }

  return answered;
}

/** Inserts `rows` into `table`, and answers them as the database wrote them. */
export async function insert<T>(table: string, rows: readonly Record<string, unknown>[]): Promise<T[]> {
  const answered = await request("POST", table, "", rows);
  return await answered.json() as T[];
}

/** Writes `patch` onto the rows of `table` that `query` selects. */
export async function update(table: string, query: string, patch: Record<string, unknown>): Promise<void> {
  const answered = await request("PATCH", table, query, patch);
  await answered.body?.cancel();
}

/** Deletes the rows of `table` that `query` selects. */
export async function remove(table: string, query: string): Promise<void> {
  const answered = await request("DELETE", table, query);
  await answered.body?.cancel();
}

/** Empties the tables the suite writes to, so a run starts from a catalog it wrote itself. */
export async function emptyCatalog(): Promise<void> {
  await remove("e2e_store_tags", "tag_id=not.is.null");
  await remove("e2e_stores", "store_id=not.is.null");
  await remove("e2e_brands", "brand_id=not.is.null");
}

/**
 * Puts the database back where a first run finds it, for `index` and the tables feeding it.
 *
 * @remarks
 * The order matters twice. The catalog is emptied first, because deleting a store fires the
 * trigger and writes to the outbox, so a line cleared before that would fill up again. And the
 * record of what the cluster was told is cleared last: a sync compares the mapping it holds to
 * the one recorded, so a row left behind next to a dropped index would make it skip the
 * creation and leave the suite searching an index that does not exist.
 */
export async function resetIndex(index: string): Promise<void> {
  await emptyCatalog();
  await remove("__search_outbox__", "entity_id=not.is.null");
  await remove("__search_sources__", `index=eq.${index}`);
  await remove("__search_indices__", `name=eq.${index}`);
}
