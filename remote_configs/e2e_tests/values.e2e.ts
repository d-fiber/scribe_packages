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

import { assert, assertEquals, assertFalse } from "@std/assert";
import { report, requireStack, RUN_ID, STACK, timed, useStack } from "./support/stack.ts";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { RemoteConfig } = await import("@scribe/remote_configs/mod.ts");
const { ConfigError } = await import("@scribe/remote_configs/contracts/config.ts");
const { remoteConfigs } = await import("@scribe/remote_configs/src/db/tables.ts");

interface Ceiling {
  readonly uploads: number;
  readonly label: string;
}

const BLANK: Ceiling = { uploads: 0, label: "" };
const TIGHT: Ceiling = { uploads: 3, label: "tight" };

const ceiling = RemoteConfig.of<Ceiling>(`e2e-ceiling-${RUN_ID}`, { default: BLANK });
const motd = RemoteConfig.of<string>(`e2e-motd-${RUN_ID}`);
const seats = RemoteConfig.of<number>(`e2e-seats-${RUN_ID}`);
const flag = RemoteConfig.of<boolean>(`e2e-flag-${RUN_ID}`);
const missing = RemoteConfig.of<string>(`e2e-missing-${RUN_ID}`);

Deno.test("remote configs e2e: a value written is a row the database completed", async () => {
  const [written, took] = await timed(() => ceiling.set(TIGHT));

  assert(written.ok, "the insert was refused by the table");

  const row = await remoteConfigs()
    .where((f) => f.name.eq(ceiling.name))
    .getOne();

  assert(row, "the value the package wrote names no row");
  assertEquals(row.expires_at, null, "a declaration without a delay must write no expiry");
  assert(row.created_at > 0, "the trigger did not stamp created_at");
  assert(row.updated_at >= row.created_at, "the trigger did not stamp updated_at");
  report("value written", `${Math.round(took)} ms`);
});

Deno.test("remote configs e2e: jsonb hands a shape back the way it was written", async () => {
  await ceiling.set(TIGHT);

  assertEquals(await ceiling.get(), TIGHT);
});

Deno.test("remote configs e2e: a scalar crosses jsonb as readily as a shape", async () => {
  await motd.set("the doors close at six");
  await seats.set(42);
  await flag.set(true);

  assertEquals(await motd.get(), "the doors close at six");
  assertEquals(await seats.get(), 42, "a number must not come back as its text");
  assertEquals(await flag.get(), true);
});

Deno.test("remote configs e2e: writing twice replaces the value and keeps one row", async () => {
  await motd.set("first");
  const first = await remoteConfigs()
    .where((f) => f.name.eq(motd.name))
    .getOne();

  await motd.set("second");
  const rows = await remoteConfigs()
    .where((f) => f.name.eq(motd.name))
    .get();

  assertEquals(rows.length, 1, "the primary key did not keep the name unique");
  assertEquals(rows[0].value, "second");
  assertEquals(rows[0].created_at, first?.created_at, "the trigger must stamp created_at on the insert only");
});

Deno.test("remote configs e2e: a config nothing was written to answers the declared value", async () => {
  assertEquals(await missing.get(), null);

  const rows = await remoteConfigs()
    .where((f) => f.name.eq(missing.name))
    .get();

  assertEquals(rows.length, 0, "reading must write nothing");
});

Deno.test("remote configs e2e: deleting takes the row out and the declared value stands again", async () => {
  await ceiling.set(TIGHT);
  assertEquals(await ceiling.get(), TIGHT);

  assert((await ceiling.delete()).ok);

  assertEquals(await ceiling.get(), BLANK, "the declared value must stand once the row is gone");
  const rows = await remoteConfigs()
    .where((f) => f.name.eq(ceiling.name))
    .get();
  assertEquals(rows.length, 0);
});

Deno.test("remote configs e2e: retiming a config that holds nothing answers not found", async () => {
  const retimed = await missing.ttl(null);

  assertFalse(retimed.ok);
  assertEquals(retimed.ok ? null : retimed.error, ConfigError.NotFound);
});
