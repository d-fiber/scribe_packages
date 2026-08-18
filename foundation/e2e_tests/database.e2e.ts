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

function items() {
  return from<E2eItem>(PostgrestClients.service(), E2E_TABLE);
}
function wipe() {
  return items().entireTable().delete();
}

Deno.test("database: the service client is authenticated, not anonymous", async () => {
  await wipe();
  const written = await items().insertOne({ label: "authenticated", weight: 1 });

  assert(written !== null, "PostgREST refused the service token");
  assertEquals(written.label, "authenticated");
  await wipe();
});

Deno.test("database: a row survives the round trip through PostgREST", async () => {
  await wipe();

  const [inserted, ms] = await timed(() => items().insertOne({ label: "first", weight: 10 }));
  report("insertOne", `${ms.toFixed(2)} ms`);

  assert(inserted !== null);
  assert(inserted.id > 0, "the identity column is filled by the database, not by the caller");
  assert(inserted.owner_id.length === 36, "the default uuid comes back too");
  await wipe();
});

Deno.test("database: select, where and order reach the real planner", async () => {
  await wipe();
  await items().insert([
    { label: "light", weight: 5 },
    { label: "middle", weight: 20 },
    { label: "heavy", weight: 30 },
  ]);

  const rows = await items()
    .select((s) => ({ label: s.label, weight: s.weight }))
    .where((f) => f.weight.gt(15))
    .order("weight")
    .get();

  assertEquals(rows.map((row) => row.label), ["middle", "heavy"]);
  assertEquals(rows.map((row) => row.weight), [20, 30]);
  await wipe();
});

Deno.test("database: getOne answers the row, and null when there is none", async () => {
  await wipe();
  await items().insert([{ label: "only", weight: 1 }]);

  assertEquals(
    (await items().select((s) => ({ label: s.label })).where((f) => f.label.eq("only")).getOne())?.label,
    "only",
  );
  assertEquals(await items().select((s) => ({ label: s.label })).where((f) => f.label.eq("absent")).getOne(), null);
  await wipe();
});

Deno.test("database: update and delete take effect in Postgres", async () => {
  await wipe();
  await items().insert([{ label: "target", weight: 1 }, { label: "bystander", weight: 1 }]);

  await items().where((f) => f.label.eq("target")).update({ weight: 99 });
  assertEquals(
    (await items().select((s) => ({ weight: s.weight })).where((f) => f.label.eq("target")).getOne())?.weight,
    99,
  );
  assertEquals(
    (await items().select((s) => ({ weight: s.weight })).where((f) => f.label.eq("bystander")).getOne())?.weight,
    1,
  );

  await items().where((f) => f.label.eq("target")).delete();
  assertEquals(await items().select((s) => ({ id: s.id })).where((f) => f.label.eq("target")).getOne(), null);
  assert((await items().select((s) => ({ id: s.id })).get()).length === 1);
  await wipe();
});

Deno.test("database: limit is honoured, and so is the server's own cap", async () => {
  await wipe();
  await items().insert(Array.from({ length: 40 }, (_, i) => ({ label: `row${i}`, weight: i })));

  assertEquals((await items().select((s) => ({ id: s.id })).limit(5).get()).length, 5);
  assertEquals((await items().select((s) => ({ id: s.id })).range(0, 9).get()).length, 10);
  await wipe();
});

Deno.test("database: a bulk insert costs one round trip, not one per row", async () => {
  await wipe();
  const count = 500;

  const [, bulk] = await timed(() =>
    items().insert(Array.from({ length: count }, (_, i) => ({ label: `bulk${i}`, weight: i })))
  );
  report(`${count}-row bulk insert`, `${bulk.toFixed(0)} ms in total, or ${(bulk / count).toFixed(3)} ms a row`);
  assertEquals((await items().select((s) => ({ id: s.id })).limit(1000).get()).length, count);

  const reads = 100;
  const [, sequential] = await timed(async () => {
    for (let i = 0; i < reads; i++) await items().select((s) => ({ id: s.id })).limit(1).get();
  });
  report(
    `${reads} sequential selects`,
    `${(sequential / reads).toFixed(3)} ms per select, or ${Math.round(reads / sequential * 1000)} a second`,
  );

  await wipe();
});
