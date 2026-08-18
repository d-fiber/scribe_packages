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
import { Tables } from "@scribe/foundation/src/database/gen/tables.ts";
import type { PostgrestClient } from "@supabase/postgrest-js";
import { FakePostgrestClient, type FakePostgrestSeed, type Row, type RpcHandler } from "@scribe/core/testing/database/fake_postgrest.ts";

export class DatabaseMock {
  readonly db: FakePostgrestClient;
  readonly service: Tables;
  #user: Tables | null = null;
  #admin: Tables | null = null;

  constructor(seed: FakePostgrestSeed = {}) {
    this.db = new FakePostgrestClient(seed);
    this.service = new Tables(this.db as unknown as PostgrestClient);
  }

  get user(): Tables | null {
    return this.#user;
  }

  get admin(): Tables | null {
    return this.#admin;
  }

  get tables(): DatabaseMock {
    return this;
  }

  asUser(): Tables {
    return (this.#user ??= new Tables(this.db as unknown as PostgrestClient));
  }

  asAdmin(): Tables {
    return (this.#admin ??= new Tables(this.db as unknown as PostgrestClient));
  }

  rows(table: string): Row[] {
    return this.db.rows(table);
  }

  seed(table: string, rows: Row[]): void {
    this.db.seed(table, rows);
  }

  onRpc(fn: string, handler: RpcHandler): void {
    this.db.onRpc(fn, handler);
  }
}

export function createDatabaseMock(seed: FakePostgrestSeed = {}): DatabaseMock {
  return new DatabaseMock(seed);
}
