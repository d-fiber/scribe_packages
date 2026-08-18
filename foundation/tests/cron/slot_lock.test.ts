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

import { SlotLock } from "@scribe/foundation/src/cron/runner/slot_lock.ts";
import type { Scheduled } from "@scribe/foundation/src/cron/schedule/mod.ts";
import { Time } from "@scribe/core/contracts/common/time.ts";
import { assertEquals, assertNotEquals } from "@std/assert";

function intervalJob(name: string, ms: number): Scheduled {
  return {
    name,
    schedule: { kind: "interval", ms },
    timeout: Time.seconds(30),
  } as unknown as Scheduled;
}

function cronJob(name: string): Scheduled {
  return {
    name,
    schedule: { kind: "cron" },
    timeout: Time.seconds(30),
  } as unknown as Scheduled;
}

const lock = new SlotLock();

Deno.test("SlotLock floors an interval slot so every instance agrees on the key", () => {
  const job = intervalJob("cleanup", 60_000);

  const a = lock.keyFor(job, new Date(1_700_000_040_000));
  const b = lock.keyFor(job, new Date(1_700_000_059_999));

  assertEquals(a, b);
  assertEquals(a, "cron:lock:cleanup:1700000040000");
});

Deno.test("SlotLock gives consecutive interval slots distinct keys", () => {
  const job = intervalJob("cleanup", 60_000);

  assertNotEquals(
    lock.keyFor(job, new Date(1_700_000_040_000)),
    lock.keyFor(job, new Date(1_700_000_100_000)),
  );
});

Deno.test("SlotLock uses the exact instant for a calendar schedule", () => {
  const at = new Date(1_700_000_012_345);

  assertEquals(lock.keyFor(cronJob("digest"), at), "cron:lock:digest:1700000012345");
});

Deno.test("SlotLock namespaces by job name", () => {
  const at = new Date(1_700_000_040_000);

  assertNotEquals(
    lock.keyFor(intervalJob("a", 60_000), at),
    lock.keyFor(intervalJob("b", 60_000), at),
  );
});
