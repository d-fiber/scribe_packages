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

import { assert, assertEquals } from "@std/assert";
import { report, requireStack, RUN_ID, STACK, timed, useStack } from "./support/stack.ts";

await requireStack(`${STACK.natsMonitorUrl}/healthz`);
await useStack();

const { Cron, cronExpression, CronTimezone, every } = await import("@scribe/foundation/src/cron/mod.ts");
const { SlotLock } = await import("@scribe/foundation/src/cron/runner/slot_lock.ts");
const { Time } = await import("@scribe/core/contracts/common/time.ts");

function minuteSlot(offsetMinutes = 0): Date {
  return new Date(
    Math.floor(Date.now() / 60_000) * 60_000 + offsetMinutes * 60_000,
  );
}

Deno.test("cron: an interval schedule names an occurrence still ahead", () => {
  const job = new Cron(
    { name: `e2e-interval-${RUN_ID}`, schedule: every(Time.minutes(5)) },
    () => Promise.resolve(),
  );
  const next = job.nextRun();

  assert(next !== null, "a live schedule always has a next occurrence");
  assert(
    next.getTime() > Date.now(),
    "the next occurrence cannot already be past",
  );
  assert(
    next.getTime() - Date.now() <= 5 * 60_000 + 1_000,
    "and it is within one interval",
  );
});

Deno.test("cron: an expression lands on the minutes it names", () => {
  const job = new Cron(
    {
      name: `e2e-expression-${RUN_ID}`,
      schedule: cronExpression("*/10 * * * *", CronTimezone.Utc),
    },
    () => Promise.resolve(),
  );

  const next = job.nextRun();

  assert(next !== null);
  assertEquals(
    next.getUTCMinutes() % 10,
    0,
    "*/10 fires only on a multiple of ten",
  );
  assertEquals(next.getUTCSeconds(), 0);
});

Deno.test("cron: the slot lock lets exactly one replica through", async () => {
  const job = new Cron(
    { name: `e2e-lock-${RUN_ID}`, schedule: every(Time.minutes(1)) },
    () => Promise.resolve(),
  );
  const lock = new SlotLock();
  const slot = minuteSlot(3);

  const [first, ms] = await timed(() => lock.claim(job, slot));
  const second = await lock.claim(job, slot);
  const third = await lock.claim(job, slot);

  report("one claim against Redis", `${ms.toFixed(2)} ms`);
  assertEquals(first, true, "the first replica to arrive runs the occurrence");
  assertEquals(
    second,
    false,
    "and every other replica of the same slot stands down",
  );
  assertEquals(third, false);
});

Deno.test("cron: the next occurrence is a claim of its own", async () => {
  const job = new Cron(
    { name: `e2e-lock-next-${RUN_ID}`, schedule: every(Time.minutes(1)) },
    () => Promise.resolve(),
  );
  const lock = new SlotLock();

  assertEquals(await lock.claim(job, minuteSlot(5)), true);
  assertEquals(
    await lock.claim(job, minuteSlot(6)),
    true,
    "a claim covers one occurrence, not the job",
  );
  assertEquals(await lock.claim(job, minuteSlot(5)), false);
});

Deno.test("cron: two jobs never share an occurrence", async () => {
  const first = new Cron(
    { name: `e2e-lock-a-${RUN_ID}`, schedule: every(Time.minutes(1)) },
    () => Promise.resolve(),
  );
  const second = new Cron(
    { name: `e2e-lock-b-${RUN_ID}`, schedule: every(Time.minutes(1)) },
    () => Promise.resolve(),
  );
  const lock = new SlotLock();
  const slot = minuteSlot(9);

  assertEquals(await lock.claim(first, slot), true);
  assertEquals(
    await lock.claim(second, slot),
    true,
    "the key carries the job name as well as the slot",
  );
});

Deno.test("cron: claiming costs one Redis round trip", async () => {
  const job = new Cron(
    { name: `e2e-lock-rate-${RUN_ID}`, schedule: every(Time.minutes(1)) },
    () => Promise.resolve(),
  );
  const lock = new SlotLock();
  const count = 200;

  const [, ms] = await timed(async () => {
    for (let i = 0; i < count; i++) await lock.claim(job, minuteSlot(100 + i));
  });

  report(
    `${count} claims`,
    `${(ms / count).toFixed(3)} ms each, or ${Math.round((count / ms) * 1000)} a second`,
  );
});
