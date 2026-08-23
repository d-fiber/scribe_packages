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

import { installDrivers } from "@scribe/foundation/tests/testing/drivers.ts";
import "@scribe/foundation/tests/testing/settings.ts";

import { assertEquals, assertThrows } from "@std/assert";
import { FakeTime } from "@std/testing/time";
import type { Scheduled } from "@scribe/foundation/lib/src/cron/schedule.ts";
import { CronRunner } from "@scribe/foundation/lib/src/cron/cron_runner.ts";
import { kv } from "@scribe/foundation/lib/src/redis/kv.ts";
import { Duration } from "@scribe/alchemy";

function shadowOccurrenceClaim(): { restore(): void } {
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

function shadowUnreachableRedis(): { restore(): void } {
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

function intervalJob(name: string, every: Duration, timeout = Duration.minutes(10)): Scheduled {
  return { name, schedule: { kind: "interval", every }, timeout };
}

installDrivers();

Deno.test("CronRunner.register() throws on a duplicate job name a second job would otherwise silently overwrite the first", () => {
  const runner = new CronRunner();
  runner.register(intervalJob("dup", Duration.milliseconds(60_000)), () => Promise.resolve());

  assertThrows(() => runner.register(intervalJob("dup", Duration.milliseconds(60_000)), () => Promise.resolve()));
});

Deno.test(
  "CronRunner.start() starts the loop even with no job, so a late registration still fires",
  async () => {
    const time = new FakeTime();
    const claim = shadowOccurrenceClaim();
    try {
      const runner = new CronRunner();
      runner.start(Duration.milliseconds(10_000));

      let calls = 0;
      runner.register(intervalJob("late", Duration.milliseconds(60_000)), () => {
        calls++;
        return Promise.resolve();
      });

      await time.tickAsync(60_000);
      await time.runMicrotasks();

      assertEquals(calls, 1, "the job registered after start() fired on its first interval");
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
  const claim = shadowOccurrenceClaim();
  try {
    const runner = new CronRunner();
    let calls = 0;
    runner.register(intervalJob("job", Duration.milliseconds(60_000)), () => {
      calls++;
      return Promise.resolve();
    });

    runner.start(Duration.milliseconds(10_000));
    await time.tickAsync(60_000);

    await time.runMicrotasks();

    assertEquals(calls, 1, "the job fired once its interval elapsed");
    runner.stop();
  } finally {
    claim.restore();
    time.restore();
  }
});

Deno.test("CronRunner skips a tick while the previous run of the same job is still in flight", async () => {
  const time = new FakeTime(new Date("2026-01-01T00:00:00.000Z"));
  const claim = shadowOccurrenceClaim();
  try {
    const runner = new CronRunner();
    let calls = 0;
    const releases: Array<() => void> = [];
    runner.register(intervalJob("job", Duration.milliseconds(60_000)), () => {
      calls++;
      return new Promise<void>((resolve) => releases.push(resolve));
    });

    runner.start(Duration.milliseconds(10_000));
    await time.tickAsync(60_000);
    await time.runMicrotasks();
    assertEquals(calls, 1, "the first interval fired the job, whose handler now hangs");

    await time.tickAsync(60_000);
    await time.runMicrotasks();
    assertEquals(calls, 1, "the second interval found the job still in flight and skipped it");

    releases[0]();
    await time.tickAsync(0);

    await time.tickAsync(60_000);
    await time.runMicrotasks();
    assertEquals(calls, 2, "the third interval found the slot free and fired the job again");

    runner.stop();
  } finally {
    claim.restore();
    time.restore();
  }
});

Deno.test("CronRunner's watchdog frees a job that exceeds its timeout, without a late finish corrupting a newer run", async () => {
  const time = new FakeTime(new Date("2026-01-01T00:00:00.000Z"));
  const claim = shadowOccurrenceClaim();
  try {
    const runner = new CronRunner();
    let calls = 0;
    const releases: Array<() => void> = [];
    runner.register(
      intervalJob("job", Duration.milliseconds(180_000), Duration.minutes(1)),
      () => {
        calls++;
        return new Promise<void>((resolve) => releases.push(resolve));
      },
    );

    runner.start(Duration.milliseconds(10_000));
    await time.tickAsync(180_000);
    await time.runMicrotasks();
    assertEquals(calls, 1, "t=180s: the first interval fired the job, whose handler now hangs");

    await time.tickAsync(60_000);
    await time.runMicrotasks();
    assertEquals(calls, 1, "t=240s: the watchdog freed the slot, and the job is not due again");

    await time.tickAsync(120_000);
    await time.runMicrotasks();
    assertEquals(calls, 2, "t=360s: the job is due again and the freed slot let it fire");

    releases[0]();
    await time.tickAsync(0);
    await time.runMicrotasks();
    assertEquals(
      calls,
      2,
      "the first call settling after the watchdog gave up left the second run untouched",
    );

    releases[1]();
    runner.stop();
  } finally {
    claim.restore();
    time.restore();
  }
});

Deno.test("CronRunner: two instances on the same occurrence, only one runs it", async () => {
  const time = new FakeTime(new Date("2026-01-01T00:00:00.000Z"));
  const claim = shadowOccurrenceClaim();
  try {
    const first = new CronRunner();
    const second = new CronRunner();
    let calls = 0;
    const handler = () => {
      calls++;
      return Promise.resolve();
    };

    first.register(intervalJob("shared", Duration.milliseconds(60_000)), handler);
    second.register(intervalJob("shared", Duration.milliseconds(60_000)), handler);

    first.start(Duration.milliseconds(10_000));
    second.start(Duration.milliseconds(10_000));
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
  const claim = shadowUnreachableRedis();
  try {
    const runner = new CronRunner();
    let calls = 0;
    runner.register(intervalJob("job", Duration.milliseconds(60_000)), () => {
      calls++;
      return Promise.resolve();
    });

    runner.start(Duration.milliseconds(10_000));
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
  const claim = shadowOccurrenceClaim();
  try {
    let calls = 0;
    const handler = () => {
      calls++;
      return Promise.resolve();
    };

    const first = new CronRunner();
    first.register(intervalJob("shared", Duration.milliseconds(60_000)), handler);
    first.start(Duration.milliseconds(10_000));

    await time.tickAsync(30_000);

    const second = new CronRunner();
    second.register(intervalJob("shared", Duration.milliseconds(60_000)), handler);
    second.start(Duration.milliseconds(10_000));

    await time.tickAsync(30_000);
    await time.runMicrotasks();
    assertEquals(calls, 1, "t=60s: the first instance reached its interval and fired");

    await time.tickAsync(30_000);
    await time.runMicrotasks();
    assertEquals(
      calls,
      1,
      "t=90s: the second instance reached its own interval, and the shared quantum sent it "
        + "at the key the first one already took",
    );

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
    const claim = shadowOccurrenceClaim();
    try {
      const runner = new CronRunner();
      let inFlight = 0;
      let peak = 0;
      let settle: (() => void)[] = [];

      for (let i = 0; i < 10; i++) {
        runner.register(intervalJob(`burst-${i}`, Duration.milliseconds(60_000)), () => {
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

      runner.start(Duration.milliseconds(10_000), 3);
      await time.tickAsync(60_000);
      await time.runMicrotasks();

      assertEquals(peak, 3, "ten jobs due at once ran three at a time");

      while (settle.length > 0) {
        const pending = settle;
        settle = [];
        for (const done of pending) done();
        await time.runMicrotasks();
      }

      assertEquals(peak, 3, "draining the remaining seven never went past the cap either");
      runner.stop();
    } finally {
      claim.restore();
      time.restore();
    }
  },
);
