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
import { FakePostgrestClient, type FakePostgrestSeed, type Row } from "@scribe/foundation/testing/database.ts";
import { installRateLimiterMock, installValkeryMock } from "@scribe/foundation/testing/valkery.ts";
import { type InstalledMock, installMock } from "@scribe/core/testing/install.ts";
import type { PostgrestClient } from "@supabase/postgrest-js";

/** The tables of this package, standing in for Postgres, and what a test reads back. */
export interface InstalledAuth extends InstalledMock {
  /** The rows of `table`, in the order they were written. */
  rows(table: string): Row[];

  /** Puts `rows` in `table`, replacing what it held. */
  seed(table: string, rows: Row[]): void;
}

/**
 * Stands in for everything this package reaches, so a project can test a declaration without a
 * database and without a cache.
 *
 * The cache and the rate limiter go with the tables. Banning drops what every store remembers
 * about the account, and against a live Valkery those calls would reach a process this test does
 * not own; and every limit this package declares is closed on an outage, so an unstubbed one
 * would refuse every call and make a test pass for the wrong reason.
 *
 * The four tables the package owns are always there, empty. A project's own tables are seeded by
 * whoever names them, since the package has no way of knowing which ones a declaration folds in.
 */
export function installAuthMock(seed: FakePostgrestSeed = {}): InstalledAuth {
  const fake = new FakePostgrestClient({
    __accounts__: [],
    __account_devices__: [],
    __account_bans__: [],
    __pending_tokens__: [],
    ...seed,
  });

  const database = installMock(
    PostgrestClients,
    "service",
    () => fake as unknown as PostgrestClient,
  );
  const valkery = installValkeryMock();
  const limiter = installRateLimiterMock();

  return {
    restore: () => {
      limiter.restore();
      valkery.restore();
      database.restore();
    },
    rows: (table: string) => fake.rows(table),
    seed: (table: string, rows: Row[]) => fake.seed(table, rows),
  };
}
