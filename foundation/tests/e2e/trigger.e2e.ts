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

import { E2E_TABLE, type E2eItem, report, requireStack, STACK, timed, useStack } from "@scribe/foundation/tests/e2e/support/stack.ts";
import { assert, assertEquals } from "@std/assert";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { PostgrestClients } = await import("@scribe/foundation/lib/src/database/postgrest_clients.ts");
const { from } = await import("@scribe/foundation/lib/src/database/tables_base.ts");
const { Trigger } = await import("@scribe/foundation/lib/src/trigger/trigger.ts");
const { syncDeclaredSources } = await import("@scribe/foundation/lib/src/trigger/trigger_sources.ts");
const { triggerEvents, triggerSources } = await import("@scribe/foundation/lib/src/trigger/trigger_tables.ts");

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
  assert(written.ok);

  const rows = await events();

  assertEquals(rows.length, 1);
  assertEquals(rows[0].table_name, E2E_TABLE);
  assertEquals(rows[0].op, "insert");
  assertEquals(rows[0].entity_id, String(written.data.id));
  assertEquals(rows[0].before, null);
  assertEquals((rows[0].after as unknown as E2eItem).label, "watched");
  await clear();
});

Deno.test("trigger: an update carries both sides of the row", async () => {
  await clear();
  await declareSource();
  const outcome = await table().insertOne({ label: "before", weight: 1 });
  assert(outcome.ok, "the row was not written");
  const written = outcome.data;
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
  const outcome = await table().insertOne({ label: "still", weight: 7 });
  assert(outcome.ok, "the row was not written");
  const written = outcome.data;
  assert(written !== null);
  await forgetEvents();

  await table().where((f) => f.id.eq(written.id)).update({ weight: 7 });

  assertEquals((await events()).length, 0);
  await clear();
});

Deno.test("trigger: a deletion carries the row that went", async () => {
  await clear();
  await declareSource();
  const outcome = await table().insertOne({ label: "gone", weight: 2 });
  assert(outcome.ok, "the row was not written");
  const written = outcome.data;
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
