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

import "@scribe/core/testing/settings.ts";
// Uses FakeTime (@std/testing/time) rather than real timers: the tick loop
// and the per-job watchdog both use setTimeout, and the shortest legal
// the smallest cron duration is one minute (see runtime/event_driven/cron/core/duration.ts)
// waiting for that in real time would make this suite minutes long. FakeTime
// mocks Date/setTimeout/clearTimeout globally, so `register()` also picks up
// the fake "now" (it calls `new Date()` internally see runner.ts).

import { assertEquals, assertThrows } from "@std/assert";
import { FakeTime } from "@std/testing/time";
import type { Scheduled } from "@scribe/foundation/src/cron/schedule.ts";
import { CronRunner } from "@scribe/foundation/src/cron/runner/cron_runner.ts";
import { kv } from "@scribe/core/runtime/redis/mod.ts";
import { Time } from "@scribe/core/contracts/common/time.ts";

// Since the occurrence lock, `#fire()` awaits a Redis `SET NX` before
// before calling the handler. Under FakeTime the real client would never answer:
// we shadow `set` with an own property (it lives on ioredis's prototype,
// `stub()` has no grip on it), as tests/tests/dependencies/database/rest does.
function claimNx(): { restore(): void } {
  const target = kv() as unknown as Record<string, unknown>;
  const had = Object.prototype.hasOwnProperty.call(target, "set");
  const original = target.set;
  const taken = new Set<string>();

  target.set = (key: string) => {
    if (taken.has(key)) return Promise.resolve(null);
    taken.add(key);
    return Promise.resolve("OK");
  };

  return {
    restore(): void {
      if (had) target.set = original;
      else delete target.set;
    },
  };
}

function claimUnavailable(): { restore(): void } {
  const target = kv() as unknown as Record<string, unknown>;
  const had = Object.prototype.hasOwnProperty.call(target, "set");
  const original = target.set;

  target.set = () => Promise.reject(new Error("redis down"));

  return {
    restore(): void {
      if (had) target.set = original;
      else delete target.set;
    },
  };
}

function intervalJob(
  name: string,
  intervalMs: number,
  timeout = Time.minutes(10),
): Scheduled {
  return {
    name,
    schedule: { kind: "interval", ms: intervalMs },
    timeout,
  };
}

Deno.test("CronRunner.register() throws on a duplicate job name a second job would otherwise silently overwrite the first", () => {
  const runner = new CronRunner();
  runner.register(intervalJob("dup", 60_000), () => Promise.resolve());

  assertThrows(() => runner.register(intervalJob("dup", 60_000), () => Promise.resolve()));
});

Deno.test(
  "CronRunner.start() starts the loop even with no job, so a late registration still fires",
  async () => {
    const time = new FakeTime();
    const claim = claimNx();
    try {
      const runner = new CronRunner();
      runner.start(10_000);

      let calls = 0;
      runner.register(intervalJob("late", 60_000), () => {
        calls++;
        return Promise.resolve();
      });

      await time.tickAsync(60_000);
      await time.runMicrotasks();

      assertEquals(calls, 1);
      runner.stop();
    } finally {
      claim.restore();
      time.restore();
    }
  },
);

Deno.test("CronRunner.stop() is safe even if start() was never called", () => {
  const runner = new CronRunner();
  runner.stop();
});

Deno.test("CronRunner fires a due job on tick, then reschedules it for the next interval", async () => {
  const time = new FakeTime(new Date("2026-01-01T00:00:00.000Z"));
  const claim = claimNx();
  try {
    const runner = new CronRunner();
    let calls = 0;
    runner.register(intervalJob("job", 60_000), () => {
      calls++;
      return Promise.resolve();
    });

    runner.start(10_000);
    await time.tickAsync(60_000);

    await time.runMicrotasks();

    assertEquals(calls, 1);
    runner.stop();
  } finally {
    claim.restore();
    time.restore();
  }
});

Deno.test("CronRunner skips a tick while the previous run of the same job is still in flight", async () => {
  const time = new FakeTime(new Date("2026-01-01T00:00:00.000Z"));
  const claim = claimNx();
  try {
    const runner = new CronRunner();
    let calls = 0;
    const releases: Array<() => void> = [];
    runner.register(intervalJob("job", 60_000), () => {
      calls++;
      return new Promise<void>((resolve) => releases.push(resolve));
    });

    runner.start(10_000);
    await time.tickAsync(60_000); // first fire, handler hangs
    await time.runMicrotasks();
    assertEquals(calls, 1);

    await time.tickAsync(60_000); // due again, but still running: skipped
    await time.runMicrotasks();
    assertEquals(calls, 1);

    releases[0]();
    await time.tickAsync(0); // flush the resolved handler's .finally()

    await time.tickAsync(60_000); // due again, now free: fires
    await time.runMicrotasks();
    assertEquals(calls, 2);

    runner.stop();
  } finally {
    claim.restore();
    time.restore();
  }
});

Deno.test("CronRunner's watchdog frees a job that exceeds its timeout, without a late finish corrupting a newer run", async () => {
  const time = new FakeTime(new Date("2026-01-01T00:00:00.000Z"));
  const claim = claimNx();
  try {
    const runner = new CronRunner();
    let calls = 0;
    const releases: Array<() => void> = [];
    // Interval longer than the timeout, so the sequence is unambiguous:
    // fire -> timeout elapses (freed) -> interval elapses (fires again).
    runner.register(
      intervalJob("job", 180_000, Time.minutes(1)),
      () => {
        calls++;
        return new Promise<void>((resolve) => releases.push(resolve));
      },
    );

    runner.start(10_000);
    await time.tickAsync(180_000); // first fire (t=180s)
    await time.runMicrotasks();
    assertEquals(calls, 1);

    await time.tickAsync(60_000); // t=240s: 60s timeout elapsed, watchdog frees the slot
    await time.runMicrotasks();
    assertEquals(calls, 1); // not due again yet (next interval fire is t=360s)

    await time.tickAsync(120_000); // t=360s: due again, slot free since the watchdog freed it
    await time.runMicrotasks();
    assertEquals(calls, 2);

    // The original (first) call finally settles, long after the watchdog
    // already moved on. Its `.finally()` must not reset the state of the
    // second, still in-flight invocation which is exactly what a plain
    // boolean (instead of a per-invocation token) would get wrong.
    releases[0]();
    await time.tickAsync(0);
    await time.runMicrotasks();
    assertEquals(calls, 2); // the stale finally didn't trigger anything

    releases[1]();
    runner.stop();
  } finally {
    claim.restore();
    time.restore();
  }
});

Deno.test("CronRunner: two instances on the same occurrence, only one runs it", async () => {
  const time = new FakeTime(new Date("2026-01-01T00:00:00.000Z"));
  const claim = claimNx();
  try {
    const first = new CronRunner();
    const second = new CronRunner();
    let calls = 0;
    const handler = () => {
      calls++;
      return Promise.resolve();
    };

    first.register(intervalJob("shared", 60_000), handler);
    second.register(intervalJob("shared", 60_000), handler);

    first.start(10_000);
    second.start(10_000);
    await time.tickAsync(60_000);
    await time.runMicrotasks();

    assertEquals(calls, 1);

    first.stop();
    second.stop();
  } finally {
    claim.restore();
    time.restore();
  }
});

Deno.test("CronRunner: Redis unreachable, the job is skipped rather than run N times", async () => {
  const time = new FakeTime(new Date("2026-01-01T00:00:00.000Z"));
  const claim = claimUnavailable();
  try {
    const runner = new CronRunner();
    let calls = 0;
    runner.register(intervalJob("job", 60_000), () => {
      calls++;
      return Promise.resolve();
    });

    runner.start(10_000);
    await time.tickAsync(60_000);
    await time.runMicrotasks();

    assertEquals(calls, 0);

    runner.stop();
  } finally {
    claim.restore();
    time.restore();
  }
});

Deno.test("CronRunner: two instances started out of sync on an interval share the same slot", async () => {
  const time = new FakeTime(new Date("2026-01-01T00:00:00.000Z"));
  const claim = claimNx();
  try {
    let calls = 0;
    const handler = () => {
      calls++;
      return Promise.resolve();
    };

    // `nextRun` for an interval counts from registration: the second
    // instance therefore has a slot timestamp offset by 30s. Without
    // quantization each would win its own key and the job would run twice
    // fois par minute.
    const first = new CronRunner();
    first.register(intervalJob("shared", 60_000), handler);
    first.start(10_000);

    await time.tickAsync(30_000);

    const second = new CronRunner();
    second.register(intervalJob("shared", 60_000), handler);
    second.start(10_000);

    await time.tickAsync(30_000); // t=60s: the first one fires
    await time.runMicrotasks();
    assertEquals(calls, 1);

    await time.tickAsync(30_000); // t=90s: the second is due, same quantum
    await time.runMicrotasks();
    assertEquals(calls, 1);

    first.stop();
    second.stop();
  } finally {
    claim.restore();
    time.restore();
  }
});

Deno.test(
  "CronRunner caps concurrent executions instead of launching everything at once",
  async () => {
    const time = new FakeTime(new Date("2026-01-01T00:00:00.000Z"));
    const claim = claimNx();
    try {
      const runner = new CronRunner();
      let inFlight = 0;
      let peak = 0;
      let settle: (() => void)[] = [];

      // 10 jobs due at the same instant, cap of 3: without a semaphore all 10
      // partiraient ensemble.
      for (let i = 0; i < 10; i++) {
        runner.register(intervalJob(`burst-${i}`, 60_000), () => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          return new Promise<void>((resolve) =>
            settle.push(() => {
              inFlight--;
              resolve();
            })
          );
        });
      }

      runner.start(10_000, 3);
      await time.tickAsync(60_000);
      await time.runMicrotasks();

      assertEquals(peak, 3);

      // Release everything; the queue must drain without exceeding the cap.
      while (settle.length > 0) {
        const pending = settle;
        settle = [];
        for (const done of pending) done();
        await time.runMicrotasks();
      }

      assertEquals(peak, 3);
      runner.stop();
    } finally {
      claim.restore();
      time.restore();
    }
  },
);
