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

import "@scribe/core/testing/settings.ts";
import { type InstalledMock, installMock } from "@scribe/core/testing/install.ts";
import { PostgrestClients } from "@scribe/foundation/src/database/client.ts";
import { FakePostgrestClient, type FakePostgrestSeed } from "@scribe/foundation/testing/database.ts";
import type { PostgrestClient } from "@supabase/postgrest-js";

/**
 * Answers the queries of this subject with in-memory rows, and hands back the restore handle.
 *
 * The service client is what both tables are reached through, since neither is readable under
 * row level security. Replacing it leaves the query builder, the table names and the filters
 * under test rather than replacing them with a second implementation.
 *
 * @param seed - The rows each table starts with. Both start empty when absent.
 */
export function installDatabaseFake(seed: FakePostgrestSeed = {}): InstalledMock {
  const filled: FakePostgrestSeed = {
    __trigger_events__: [],
    __trigger_sources__: [],
    ...seed,
  };

  const fake = new FakePostgrestClient(filled) as unknown as PostgrestClient;

  return installMock(PostgrestClients, "service", () => fake);
}
