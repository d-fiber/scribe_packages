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
import { FakePostgrestClient, type FakePostgrestSeed, type Row } from "@scribe/foundation/testing/database.ts";
import { installValkeryMock } from "@scribe/foundation/testing/valkery.ts";
import { type InstalledMock, installMock } from "@scribe/core/testing/install.ts";
import type { PostgrestClient } from "@supabase/postgrest-js";

/** The table of this package, standing in for Postgres, and what a test reads back. */
export interface InstalledAudiences extends InstalledMock {
  /** The memberships the package wrote, in the order it wrote them. */
  memberships(): Row[];

  /** Puts `rows` in the table, replacing what it held. */
  seed(rows: Row[]): void;
}

/**
 * Stands in for everything this package reaches, so a project can test the code that guards a
 * route without a database and without a cache.
 *
 * The cache is replaced too, and not only the table: a membership asked about twice against a
 * live Valkery would answer the second time out of a process this test does not own, and an
 * assertion on somebody who was just put in would pass or fail for the wrong reason.
 */
export function installAudienceMock(seed: FakePostgrestSeed = {}): InstalledAudiences {
  const fake = new FakePostgrestClient({ __audiences__: [], ...seed });

  const database = installMock(
    PostgrestClients,
    "service",
    () => fake as unknown as PostgrestClient,
  );
  const valkery = installValkeryMock();

  return {
    restore: () => {
      valkery.restore();
      database.restore();
    },
    memberships: () => fake.rows("__audiences__"),
    seed: (rows: Row[]) => fake.seed("__audiences__", rows),
  };
}
