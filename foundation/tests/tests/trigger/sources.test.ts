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
import "@scribe/runtime/scholium/runner.ts";
import { equals, expect, Scribe } from "@scribe/alchemy/test";
import "../../testing/settings.ts";
import { Trigger } from "../../../lib/src/trigger/trigger.ts";
import { syncDeclaredSources } from "../../../lib/src/trigger/trigger_sources.ts";
import { triggerSources } from "../../../lib/src/trigger/trigger_tables.ts";
import { installDatabaseFake } from "./mocks/database.ts";

interface OrderRow {
  id: string;
  reference: string;
  status: string;
}

const noop = () => Promise.resolve();

const orders = Trigger.of<OrderRow>();

orders.onInsert("orders/{orderId}", noop);
orders.onFieldChange("orders/{orderId}/status", noop);
orders.onDelete({ path: "shipments/{ref}", key: "reference" }, noop);

async function storedKey(table: string): Promise<string | null> {
  const row = await triggerSources()
    .where((f) => f.table_name.eq(table))
    .getOne();

  return row === null ? null : row.key_column;
}

Scribe.test("every declared table is written once, under the key its declaration named", async () => {
  const db = installDatabaseFake();

  expect(await syncDeclaredSources(), equals(2));
  expect(await storedKey("orders"), equals("id"));
  expect(await storedKey("shipments"), equals("reference"));
  db.restore();
});

Scribe.test("two declarations on one table write one row", async () => {
  const db = installDatabaseFake();

  await syncDeclaredSources();
  const rows = await triggerSources().where((f) => f.table_name.eq("orders")).get();

  expect(rows.length, equals(1));
  db.restore();
});

Scribe.test("a key column that changed in the code is written over the stored one", async () => {
  const db = installDatabaseFake({
    __trigger_sources__: [{ table_name: "shipments", key_column: "id" }],
  });

  await syncDeclaredSources();

  expect(await storedKey("shipments"), equals("reference"));
  db.restore();
});

Scribe.test("a table nobody declares any more stops emitting", async () => {
  const db = installDatabaseFake({
    __trigger_sources__: [{ table_name: "carts", key_column: "id" }],
  });

  await syncDeclaredSources();

  expect(await storedKey("carts"), equals(null));
  expect(await storedKey("orders"), equals("id"));
  db.restore();
});
