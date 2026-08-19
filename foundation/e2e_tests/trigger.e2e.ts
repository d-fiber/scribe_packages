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

import { E2E_TABLE, type E2eItem, report, requireStack, STACK, timed, useStack } from "./support/stack.ts";
import { assert, assertEquals } from "@std/assert";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { PostgrestClients } = await import("@scribe/foundation/src/database/client.ts");
const { from } = await import("@scribe/foundation/src/database/tables.ts");
const { Trigger } = await import("@scribe/foundation/src/trigger/core/trigger.ts");
const { syncDeclaredSources } = await import("@scribe/foundation/src/trigger/db/sources.ts");
const { triggerEvents, triggerSources } = await import("@scribe/foundation/src/trigger/db/tables.ts");

const items = Trigger.of<E2eItem>();

items.onInsert(`${E2E_TABLE}/{itemId}`, () => Promise.resolve());
items.onUpdate(`${E2E_TABLE}/{itemId}`, () => Promise.resolve());
items.onDelete(`${E2E_TABLE}/{itemId}`, () => Promise.resolve());

function table() {
  return from<E2eItem>(PostgrestClients.service(), E2E_TABLE);
}

function events() {
  return triggerEvents().order("id", { ascending: true }).get();
}

function forgetEvents() {
  return triggerEvents().where((f) => f.id.gt(0)).delete();
}

async function clear(): Promise<void> {
  await table().where((f) => f.id.gt(0)).delete();
  await forgetEvents();
}

async function declareSource(): Promise<void> {
  await syncDeclaredSources();
  await forgetEvents();
}

async function silence(): Promise<void> {
  await triggerSources().where((f) => f.table_name.neq("")).delete();
  await forgetEvents();
}

Deno.test("trigger: a table nobody declared writes no event", async () => {
  await silence();
  await clear();

  await table().insertOne({ label: "unwatched", weight: 1 });

  assertEquals((await events()).length, 0);
  await clear();
});

Deno.test("trigger: a table created after the framework's own SQL emits once declared", async () => {
  await clear();
  await declareSource();

  const [written, ms] = await timed(() => table().insertOne({ label: "watched", weight: 3 }));
  report("insert through PostgREST", `${ms.toFixed(2)} ms`);
  assert(written !== null);

  const rows = await events();

  assertEquals(rows.length, 1);
  assertEquals(rows[0].table_name, E2E_TABLE);
  assertEquals(rows[0].op, "insert");
  assertEquals(rows[0].entity_id, String(written.id));
  assertEquals(rows[0].before, null);
  assertEquals((rows[0].after as unknown as E2eItem).label, "watched");
  await clear();
});

Deno.test("trigger: an update carries both sides of the row", async () => {
  await clear();
  await declareSource();
  const written = await table().insertOne({ label: "before", weight: 1 });
  assert(written !== null);
  await forgetEvents();

  await table().where((f) => f.id.eq(written.id)).update({ label: "after" });
  const rows = await events();

  assertEquals(rows.length, 1);
  assertEquals(rows[0].op, "update");
  assertEquals((rows[0].before as unknown as E2eItem).label, "before");
  assertEquals((rows[0].after as unknown as E2eItem).label, "after");
  await clear();
});

Deno.test("trigger: a write that leaves the row as it was writes nothing", async () => {
  await clear();
  await declareSource();
  const written = await table().insertOne({ label: "still", weight: 7 });
  assert(written !== null);
  await forgetEvents();

  await table().where((f) => f.id.eq(written.id)).update({ weight: 7 });

  assertEquals((await events()).length, 0);
  await clear();
});

Deno.test("trigger: a deletion carries the row that went", async () => {
  await clear();
  await declareSource();
  const written = await table().insertOne({ label: "gone", weight: 2 });
  assert(written !== null);
  await forgetEvents();

  await table().where((f) => f.id.eq(written.id)).delete();
  const rows = await events();

  assertEquals(rows.length, 1);
  assertEquals(rows[0].op, "delete");
  assertEquals(rows[0].entity_id, String(written.id));
  assertEquals((rows[0].before as unknown as E2eItem).label, "gone");
  assertEquals(rows[0].after, null);
  await clear();
});

Deno.test("trigger: the tables this subject owns do not emit for themselves", async () => {
  await clear();
  await declareSource();

  await triggerSources().where((f) => f.table_name.eq("nowhere")).delete();
  await triggerSources().insert({ table_name: "nowhere", key_column: "id" });

  assertEquals((await events()).length, 0);
  await triggerSources().where((f) => f.table_name.eq("nowhere")).delete();
  await clear();
});
