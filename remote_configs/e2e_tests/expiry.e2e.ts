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
import { Duration } from "@scribe/alchemy";
import { requireStack, RUN_ID, STACK, useStack } from "./support/stack.ts";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { RemoteConfig } = await import("@scribe/remote_configs/mod.ts");
const { ConfigError } = await import("@scribe/remote_configs/contracts/config.ts");
const { remoteConfigs } = await import("@scribe/remote_configs/src/db/tables.ts");

const banner = RemoteConfig.of<string>(`e2e-banner-${RUN_ID}`, { ttl: Duration.days(7) });
const notice = RemoteConfig.of<string>(`e2e-notice-${RUN_ID}`, { ttl: Duration.days(7) });
const maintenance = RemoteConfig.of<string>(`e2e-maintenance-${RUN_ID}`, { ttl: Duration.days(7) });
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
  assert(expiresAt >= before + Duration.days(7).inMilliseconds, "the expiry is closer than the declaration says");
});

Deno.test("remote configs e2e: a caller that names null keeps the value past the declaration", async () => {
  await notice.set("open", { ttl: null });

  assertEquals(await expiryOf(notice.name), null);
  assertEquals(await notice.get(), "open");
});

Deno.test("remote configs e2e: a value past its expiry stops answering", async () => {
  await maintenance.set("open", { ttl: Duration.milliseconds(-1_000) });

  const expiresAt = await expiryOf(maintenance.name);
  assert(expiresAt !== null && expiresAt <= Date.now(), "the negative delay wrote an expiry in the future");
  assertEquals(await maintenance.get(), null, "an expired value must not be answered");
});

Deno.test("remote configs e2e: an expired value falls back to the declared one", async () => {
  await held.set("open", { ttl: Duration.milliseconds(-1_000) });

  assertEquals(await held.get(), "closed");
});

Deno.test("remote configs e2e: retiming moves the expiry without touching the value", async () => {
  await banner.set("open", { ttl: Duration.minutes(1) });
  const before = await expiryOf(banner.name);

  assert((await banner.ttl(null)).ok);

  assert(before !== null);
  assertEquals(await expiryOf(banner.name), null);
  assertEquals(await banner.get(), "open", "the value must survive the retiming");
});

Deno.test("remote configs e2e: writing again restarts the declared delay", async () => {
  await notice.set("open", { ttl: Duration.minutes(1) });
  const short = await expiryOf(notice.name);

  await notice.set("open");
  const full = await expiryOf(notice.name);

  assert(short !== null && full !== null);
  assert(full > short, "writing must repost the expiry the declaration names");
});

Deno.test("remote configs e2e: retiming a value that expired still moves its row", async () => {
  await maintenance.set("open", { ttl: Duration.milliseconds(-1_000) });
  assertEquals(await maintenance.get(), null);

  const retimed = await maintenance.ttl(Duration.days(1));

  assert(retimed.ok, `retiming answered ${retimed.ok ? "" : retimed.error}`);
  assertEquals(await maintenance.get(), "open", "a row that is still there must come back when its expiry moves");
});

Deno.test("remote configs e2e: retiming a name the table never held answers not found", async () => {
  const gone = RemoteConfig.of<string>(`e2e-gone-${RUN_ID}`);

  const retimed = await gone.ttl(Duration.days(1));

  assertFalse(retimed.ok);
  assertEquals(retimed.ok ? null : retimed.error, ConfigError.NotFound);
});
