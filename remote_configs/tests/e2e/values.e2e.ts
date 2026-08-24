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

import { assert, assertEquals, assertFalse } from "@std/assert";
import { report, requireStack, RUN_ID, STACK, timed, useStack } from "./support/stack.ts";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { RemoteConfig } = await import("@scribe/remote_configs/lib/remote_configs.ts");
const { ConfigError } = await import("@scribe/remote_configs/lib/contracts/config.ts");
const { remoteConfigs } = await import("@scribe/remote_configs/lib/src/db/tables.ts");

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
