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

import { PostgrestClients } from "@scribe/foundation/database";
import { FakePostgrestClient, type FakePostgrestSeed, type Row } from "@scribe/foundation/testing";
import { installQueueMock, installValkeryMock } from "@scribe/foundation/testing";
import type { InstalledMock } from "@scribe/testing/install.ts";
import { installMock } from "@scribe/testing/install.ts";
import type { PostgrestClient } from "@supabase/postgrest-js";

/** The two tables of this package, standing in for Postgres, and what a test reads back. */
export interface InstalledDynamicLinks extends InstalledMock {
  /** The links the package wrote, in the order it wrote them. */
  links(): Row[];

  /** The visits the package wrote, present as soon as a call to `record()` has resolved. */
  statistics(): Row[];

  /** Puts `rows` in `table`, replacing what it held. */
  seed(table: string, rows: Row[]): void;
}

/**
 * Stands in for everything this package reaches, so a project can test the routes that serve
 * its links without a database, without a cache and without a message broker.
 *
 * The cache and the statistics queue are replaced too, and not only the tables: a slug resolved
 * twice against a live Valkery would answer the second time from a process this test does not
 * own, and a visit pushed to the real queue would need a NATS connection this test has no reason
 * to hold. `__dynamic_links__` also gets its slug declared unique, the one constraint a project
 * relies on in production: without it, a second link could be written under a slug the first one
 * already answers to, which the real table's own unique index never allows.
 */
export function installDynamicLinksMock(seed: FakePostgrestSeed = {}): InstalledDynamicLinks {
  const fake = new FakePostgrestClient({
    __dynamic_links__: [],
    __dynamic_link_statistics__: [],
    ...seed,
  });
  fake.declareUniqueKey("__dynamic_links__", ["slug"]);

  const database = installMock(
    PostgrestClients,
    "service",
    () => fake as unknown as PostgrestClient,
  );
  const valkery = installValkeryMock();
  const queue = installQueueMock();

  return {
    restore: () => {
      queue.restore();
      valkery.restore();
      database.restore();
    },
    links: () => fake.rows("__dynamic_links__"),
    statistics: () => fake.rows("__dynamic_link_statistics__"),
    seed: (table: string, rows: Row[]) => fake.seed(table, rows),
  };
}
