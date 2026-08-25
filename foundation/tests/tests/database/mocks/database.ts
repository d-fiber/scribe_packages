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

import "../../../testing/settings.ts";
import { TablesBase } from "../../../../lib/src/database/tables_base.ts";
import type { PostgrestClient } from "@supabase/postgrest-js";
import { FakePostgrestClient, type FakePostgrestSeed, type Row, type RpcHandler } from "../../../testing/database.ts";

export class DatabaseMock {
  readonly db: FakePostgrestClient;
  readonly service: TablesBase;
  #user: TablesBase | null = null;
  #admin: TablesBase | null = null;

  constructor(seed: FakePostgrestSeed = {}) {
    this.db = new FakePostgrestClient(seed);
    this.service = new TablesBase(this.db as unknown as PostgrestClient);
  }

  get user(): TablesBase | null {
    return this.#user;
  }

  get admin(): TablesBase | null {
    return this.#admin;
  }

  get tables(): DatabaseMock {
    return this;
  }

  asUser(): TablesBase {
    return (this.#user ??= new TablesBase(this.db as unknown as PostgrestClient));
  }

  asAdmin(): TablesBase {
    return (this.#admin ??= new TablesBase(this.db as unknown as PostgrestClient));
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
