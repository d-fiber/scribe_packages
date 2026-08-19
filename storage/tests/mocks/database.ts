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

/** A database fake, plus the handle that puts the real client back. */
export interface InstalledDatabase extends InstalledMock {
  /** The rows the index holds, readable and writable straight from a test. */
  readonly fake: FakePostgrestClient;
}

/**
 * Answers every query of this package with in-memory rows, and hands back the restore handle.
 *
 * The service client is what the index reaches, since a row is written with the key that
 * bypasses row level security. Replacing it leaves the query builder, the table name and the
 * filters under test rather than replacing them with a second implementation.
 */
export function installDatabaseFake(seed: FakePostgrestSeed = {}): InstalledDatabase {
  const fake = new FakePostgrestClient({ __storage_objects__: [], ...seed });
  const installed = installMock(
    PostgrestClients,
    "service",
    () => fake as unknown as PostgrestClient,
  );

  return { fake, restore: installed.restore };
}

/** Answers every write with an error, which is how a test exercises an index that refuses. */
export function installRefusingDatabase(): InstalledMock {
  const refusing = {
    from: () => ({
      select: () => builderOf(null),
      insert: () => builderOf(null, { message: "index is read only" }),
      update: () => builderOf(null, { message: "index is read only" }),
      delete: () => builderOf(null, { message: "index is read only" }),
    }),
  };

  return installMock(
    PostgrestClients,
    "service",
    () => refusing as unknown as PostgrestClient,
  );
}

function builderOf(data: unknown, error: unknown = null) {
  const answer = Promise.resolve({ data, error });
  const builder = {
    select: () => builder,
    eq: () => builder,
    gt: () => builder,
    in: () => builder,
    like: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => builder,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => answer.then(resolve, reject),
  };

  return builder;
}
