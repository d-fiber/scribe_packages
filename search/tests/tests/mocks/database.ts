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

import { installSearchTestSettings } from "../../testing/settings.ts";

installSearchTestSettings();
import { type InstalledMock, installMock } from "@scribe/testing/install.ts";
import { PostgrestClients } from "@scribe/foundation/database";
import { FakePostgrestClient, type FakePostgrestSeed } from "@scribe/foundation/testing";
import type { PostgrestClient } from "@supabase/postgrest-js";

/** How many times `__search_fail__` retries a document before it stops being tried, mirroring the real function's own default caller. */
const MAX_ATTEMPTS = 5;

/**
 * Answers every query of this package with in-memory rows, and hands back the restore handle.
 *
 * The service client is what an index reads through, since a document is built from everything
 * a row holds rather than from what the caller who triggered the rebuild may see. Replacing it
 * leaves the compiled select lists and the filters under test.
 */
export function installDatabaseFake(seed: FakePostgrestSeed = {}): InstalledMock {
  const filled: FakePostgrestSeed = {
    __search_indices__: [],
    __search_sources__: [],
    __search_outbox__: [],
    ...seed,
  };

  const fake = new FakePostgrestClient(filled);
  wireOutbox(fake);

  return installMock(PostgrestClients, "service", () => fake as unknown as PostgrestClient);
}

/**
 * Mirrors `__search_enqueue__`, `__search_fail__` and `__search_backlog__` against the fake's
 * own seeded rows, in place of the Postgres functions `deploy/db/init/search.sql` ships.
 *
 * Without this, the three RPC calls the outbox makes answer `null` to everything under the
 * fake, and the deduplication `__search_outbox__` exists for is provable only against a real
 * cluster and a real database, through the shell scenario.
 */
function wireOutbox(fake: FakePostgrestClient): void {
  fake.onRpc("__search_enqueue__", (args) => {
    const index = args?.p_index as string;
    const operation = args?.p_operation as string;
    const ids = [...new Set(args?.p_ids as (string | null)[])].filter((id): id is string => id !== null);
    const outbox = fake.rows("__search_outbox__");

    for (const id of ids) {
      const existing = outbox.find((row) => row.index === index && row.entity_id === id);
      if (existing) {
        existing.operation = operation;
        existing.attempts = 0;
        existing.failed_at = null;
        existing.last_error = null;
        continue;
      }

      outbox.push({
        index,
        entity_id: id,
        operation,
        enqueued_at: Date.now(),
        attempts: 0,
        failed_at: null,
        last_error: null,
      });
    }

    return ids.length;
  });

  fake.onRpc("__search_fail__", (args) => {
    const index = args?.p_index as string;
    const ids = new Set(args?.p_ids as string[]);
    const reason = args?.p_error as string;
    const maxAttempts = (args?.p_max_attempts as number | undefined) ?? MAX_ATTEMPTS;

    let written = 0;
    for (const row of fake.rows("__search_outbox__")) {
      if (row.index !== index || row.failed_at !== null || !ids.has(row.entity_id as string)) continue;

      const attempts = (row.attempts as number) + 1;
      row.attempts = attempts;
      row.last_error = reason;
      if (attempts >= maxAttempts) row.failed_at = new Date().toISOString();
      written += 1;
    }

    return written;
  });

  fake.onRpc("__search_backlog__", (args) => {
    const index = args?.p_index as string;
    const scoped = fake.rows("__search_outbox__").filter((row) => row.index === index);

    return {
      pending: scoped.filter((row) => row.failed_at === null).length,
      failed: scoped.filter((row) => row.failed_at !== null).length,
    };
  });
}
