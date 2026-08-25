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

import { installStorageTestSettings } from "@scribe/storage/tests/testing/settings.ts";

installStorageTestSettings();
import { type InstalledMock, installMock } from "@scribe/testing/install.ts";
import { PostgrestClients } from "@scribe/foundation/lib/src/database/postgrest_clients.ts";
import { FakePostgrestClient, type FakePostgrestSeed } from "@scribe/foundation/tests/testing/database.ts";
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
