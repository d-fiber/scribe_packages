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
import { Time } from "@scribe/core/contracts/common/time.ts";
import { report, requireStack, RUN_ID, STACK, timed, useStack } from "./support/stack.ts";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { forgetValue, RemoteConfig } = await import("@scribe/remote_configs/mod.ts");
const { remoteConfigs } = await import("@scribe/remote_configs/src/db/tables.ts");

const motd = RemoteConfig.of<string>(`e2e-cached-motd-${RUN_ID}`, { default: "quiet" });
const absent = RemoteConfig.of<string>(`e2e-cached-absent-${RUN_ID}`, { default: "quiet" });
const seats = RemoteConfig.of<number>(`e2e-cached-seats-${RUN_ID}`);
const doors = RemoteConfig.of<string>(`e2e-cached-doors-${RUN_ID}`);
const lease = RemoteConfig.of<string>(`e2e-cached-lease-${RUN_ID}`, { ttl: Time.minutes(1) });

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

  await lease.ttl(Time.ms(-1_000));
  assertEquals(await lease.get(), null, "retiming must drop what the cache holds");
});
