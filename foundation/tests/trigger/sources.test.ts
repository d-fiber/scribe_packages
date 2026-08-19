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

import { assertEquals } from "@std/assert";
import { syncDeclaredSources, Trigger } from "@scribe/foundation/src/trigger/mod.ts";
import { triggerSources } from "@scribe/foundation/src/trigger/db/tables.ts";
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

Deno.test("every declared table is written once, under the key its declaration named", async () => {
  const db = installDatabaseFake();

  assertEquals(await syncDeclaredSources(), 2);
  assertEquals(await storedKey("orders"), "id");
  assertEquals(await storedKey("shipments"), "reference");
  db.restore();
});

Deno.test("two declarations on one table write one row", async () => {
  const db = installDatabaseFake();

  await syncDeclaredSources();
  const rows = await triggerSources().where((f) => f.table_name.eq("orders")).get();

  assertEquals(rows.length, 1);
  db.restore();
});

Deno.test("a key column that changed in the code is written over the stored one", async () => {
  const db = installDatabaseFake({
    __trigger_sources__: [{ table_name: "shipments", key_column: "id" }],
  });

  await syncDeclaredSources();

  assertEquals(await storedKey("shipments"), "reference");
  db.restore();
});

Deno.test("a table nobody declares any more stops emitting", async () => {
  const db = installDatabaseFake({
    __trigger_sources__: [{ table_name: "carts", key_column: "id" }],
  });

  await syncDeclaredSources();

  assertEquals(await storedKey("carts"), null);
  assertEquals(await storedKey("orders"), "id");
  db.restore();
});
