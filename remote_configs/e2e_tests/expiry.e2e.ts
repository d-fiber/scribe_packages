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
import { Time } from "@scribe/core/contracts/common/time.ts";
import { requireStack, RUN_ID, STACK, useStack } from "./support/stack.ts";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { RemoteConfig } = await import("@scribe/remote_configs/mod.ts");
const { ConfigError } = await import("@scribe/remote_configs/contracts/config.ts");
const { remoteConfigs } = await import("@scribe/remote_configs/src/db/tables.ts");

const banner = RemoteConfig.of<string>(`e2e-banner-${RUN_ID}`, { ttl: Time.days(7) });
const notice = RemoteConfig.of<string>(`e2e-notice-${RUN_ID}`, { ttl: Time.days(7) });
const maintenance = RemoteConfig.of<string>(`e2e-maintenance-${RUN_ID}`, { ttl: Time.days(7) });
const held = RemoteConfig.of<string>(`e2e-held-${RUN_ID}`, { default: "closed" });

async function expiryOf(name: string): Promise<number | null> {
  const row = await remoteConfigs()
    .where((f) => f.name.eq(name))
    .getOne();

  return row?.expires_at ?? null;
}

Deno.test("remote configs e2e: the declared delay is what a written value inherits", async () => {
  const before = Date.now();
  await banner.set("open");

  const expiresAt = await expiryOf(banner.name);

  assert(expiresAt !== null, "the declared delay wrote no expiry");
  assert(expiresAt >= before + Time.days(7).ms, "the expiry is closer than the declaration says");
});

Deno.test("remote configs e2e: a caller that names null keeps the value past the declaration", async () => {
  await notice.set("open", { ttl: null });

  assertEquals(await expiryOf(notice.name), null);
  assertEquals(await notice.get(), "open");
});

Deno.test("remote configs e2e: a value past its expiry stops answering", async () => {
  await maintenance.set("open", { ttl: Time.ms(-1_000) });

  const expiresAt = await expiryOf(maintenance.name);
  assert(expiresAt !== null && expiresAt <= Date.now(), "the negative delay wrote an expiry in the future");
  assertEquals(await maintenance.get(), null, "an expired value must not be answered");
});

Deno.test("remote configs e2e: an expired value falls back to the declared one", async () => {
  await held.set("open", { ttl: Time.ms(-1_000) });

  assertEquals(await held.get(), "closed");
});

Deno.test("remote configs e2e: retiming moves the expiry without touching the value", async () => {
  await banner.set("open", { ttl: Time.minutes(1) });
  const before = await expiryOf(banner.name);

  assert((await banner.ttl(null)).ok);

  assert(before !== null);
  assertEquals(await expiryOf(banner.name), null);
  assertEquals(await banner.get(), "open", "the value must survive the retiming");
});

Deno.test("remote configs e2e: writing again restarts the declared delay", async () => {
  await notice.set("open", { ttl: Time.minutes(1) });
  const short = await expiryOf(notice.name);

  await notice.set("open");
  const full = await expiryOf(notice.name);

  assert(short !== null && full !== null);
  assert(full > short, "writing must repost the expiry the declaration names");
});

Deno.test("remote configs e2e: retiming a value that expired still moves its row", async () => {
  await maintenance.set("open", { ttl: Time.ms(-1_000) });
  assertEquals(await maintenance.get(), null);

  const retimed = await maintenance.ttl(Time.days(1));

  assert(retimed.ok, `retiming answered ${retimed.ok ? "" : retimed.error}`);
  assertEquals(await maintenance.get(), "open", "a row that is still there must come back when its expiry moves");
});

Deno.test("remote configs e2e: retiming a name the table never held answers not found", async () => {
  const gone = RemoteConfig.of<string>(`e2e-gone-${RUN_ID}`);

  const retimed = await gone.ttl(Time.days(1));

  assertFalse(retimed.ok);
  assertEquals(retimed.ok ? null : retimed.error, ConfigError.NotFound);
});
