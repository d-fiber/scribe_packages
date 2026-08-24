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

import { assertEquals } from "@std/assert";
import { Duration } from "@scribe/alchemy";
import { report, requireStack, RUN_ID, STACK, timed, useStack } from "./support/stack.ts";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { forgetValue, RemoteConfig } = await import("@scribe/remote_configs/lib/remote_configs.ts");
const { remoteConfigs } = await import("@scribe/remote_configs/lib/src/db/tables.ts");

const motd = RemoteConfig.of<string>(`e2e-cached-motd-${RUN_ID}`, { default: "quiet" });
const absent = RemoteConfig.of<string>(`e2e-cached-absent-${RUN_ID}`, { default: "quiet" });
const seats = RemoteConfig.of<number>(`e2e-cached-seats-${RUN_ID}`);
const doors = RemoteConfig.of<string>(`e2e-cached-doors-${RUN_ID}`);
const lease = RemoteConfig.of<string>(`e2e-cached-lease-${RUN_ID}`, { ttl: Duration.minutes(1) });

Deno.test("remote configs e2e: a value answered once is answered from Redis, not from the table", async () => {
  await motd.set("loud");

  const [first, cold] = await timed(() => motd.get());
  const [second, warm] = await timed(() => motd.get());
  assertEquals(first, "loud");
  assertEquals(second, "loud");

  await remoteConfigs()
    .where((f) => f.name.eq(motd.name))
    .delete();

  assertEquals(await motd.get(), "loud", "the row is gone and the value still came, so nothing was cached");

  await forgetValue(motd.name);
  assertEquals(await motd.get(), "quiet", "the cache kept answering after it was told to forget");
  report("value read, cold then warm", `${Math.round(cold)} ms then ${Math.round(warm)} ms`);
});

Deno.test("remote configs e2e: an absence is cached too", async () => {
  assertEquals(await absent.get(), "quiet");

  await remoteConfigs().insert({
    name: absent.name,
    value: "loud",
    expires_at: null,
  });

  assertEquals(
    await absent.get(),
    "quiet",
    "an absence must be cached, otherwise every read of a config nobody wrote to reaches the table",
  );

  await forgetValue(absent.name);
  assertEquals(await absent.get(), "loud");
});

Deno.test("remote configs e2e: writing a value that was already read is seen at once", async () => {
  assertEquals(await seats.get(), null);

  await seats.set(42);
  assertEquals(await seats.get(), 42, "writing must drop what the cache holds");

  await seats.set(7);
  assertEquals(await seats.get(), 7, "writing over a value must drop what the cache holds");
});

Deno.test("remote configs e2e: deleting a value that was already read is seen at once", async () => {
  await doors.set("open");
  assertEquals(await doors.get(), "open");

  await doors.delete();
  assertEquals(await doors.get(), null, "deleting must drop what the cache holds");
});

Deno.test("remote configs e2e: retiming a value that was already read is seen at once", async () => {
  await lease.set("open");
  assertEquals(await lease.get(), "open");

  await lease.ttl(Duration.milliseconds(-1_000));
  assertEquals(await lease.get(), null, "retiming must drop what the cache holds");
});
