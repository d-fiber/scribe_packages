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

import "@scribe/runtime/scholium/runner.ts";
import { Scribe } from "@scribe/alchemy/test";
import { installDrivers } from "../../testing/drivers.ts";
import "../../testing/settings.ts";

import { Duration, Now, type NowSource } from "@scribe/alchemy";
import { assertEquals, assertNotEquals, assertThrows } from "@std/assert";
import { FakeTime } from "@std/testing/time";
import { Cron } from "../../../lib/src/cron/cron.ts";
import { CronRunner, cronRunner } from "../../../lib/src/cron/cron_runner.ts";
import { cronRegistry } from "../../../lib/src/cron/cron_registry.ts";
import { cronExpression } from "../../../lib/src/cron/cron_expression.ts";
import { CronTimezone } from "../../../lib/src/cron/cron_timezone.ts";
import { ScheduledCrons } from "../../../lib/src/cron/scheduled_crons.ts";
import { ScheduledJob } from "../../../lib/src/cron/scheduled_job.ts";
import { every } from "../../../lib/src/cron/interval_schedule.ts";
import type { Scheduled } from "../../../lib/src/cron/schedule.ts";
import { kv } from "../../../lib/src/redis/kv.ts";
import { SystemNow } from "../../../lib/src/observe/system_now.ts";

class MovableNow implements NowSource {
  at: number;

  constructor(at: number) {
    this.at = at;
  }

  millisecondsSinceEpoch(): number {
    return this.at;
  }
}

function grantingEveryClaim(): { restore(): void } {
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

function intervalJob(name: string, minutes: number, timeout = Duration.minutes(10)): Scheduled {
  return { name, schedule: { kind: "interval", every: Duration.minutes(minutes) }, timeout };
}

const noop = () => Promise.resolve();

installDrivers();

Scribe.test("new Cron() leaves a refused declaration in the registry, where the report trips over it", () => {
  assertThrows(() =>
    new Cron(
      {
        name: "hardening:no-future-run",
        schedule: cronExpression("0 0 30 2 *", CronTimezone.Utc),
      },
      noop,
    )
  );

  assertEquals(
    cronRegistry.list().some((entry) => entry.job.name === "hardening:no-future-run"),
    false,
    "the name was taken before the schedule was checked, so the registry now holds a job the " +
      "runner never accepted, report() throws for every other job too, and the name can " +
      "never be declared again",
  );
});

Scribe.test("Cron.nextRun() on an interval never counts down, so a status page shows a job that never arrives", () => {
  const clock = new MovableNow(Date.parse("2026-01-01T00:00:00.000Z"));
  Now.use(clock);
  try {
    const job = new Cron(
      { name: "hardening:countdown", schedule: every(Duration.minutes(5)) },
      noop,
    );
    const announced = job.nextRun().getTime();

    clock.at += 240_000;

    assertEquals(
      job.nextRun().getTime(),
      announced,
      "four of the five minutes went by and the answer moved with them, so what the registry " +
        "reports and what the loop holds are two different instants",
    );
  } finally {
    Now.use(new SystemNow());
  }
});

Scribe.test("the loop and the registry hold two different answers for the same interval job", () => {
  const clock = new MovableNow(Date.parse("2026-01-01T00:00:00.000Z"));
  Now.use(clock);
  try {
    const job = intervalJob("hardening:two-answers", 5);
    const held = new ScheduledJob(job, noop, () => new Date(clock.at));

    clock.at += 240_000;

    assertNotEquals(
      held.nextRunAt.getTime(),
      clock.at + Duration.minutes(5).inMilliseconds,
      "the loop keeps the grid point it computed at registration while a fresh nextRun() " +
        "answers five minutes from whenever it is asked",
    );
  } finally {
    Now.use(new SystemNow());
  }
});

Scribe.test("ScheduledCrons refuses the only time-of-day shape the port can name", () => {
  const driver = new ScheduledCrons();

  driver.schedule({
    key: "hardening:port-at",
    schedule: { at: { hour: 8, minute: 0 } },
    run: noop,
  });
});

Scribe.test("ScheduledCrons arms an empty body, so what the port declared never runs", async () => {
  const time = new FakeTime(new Date("2026-01-01T00:00:00.000Z"));
  const claim = grantingEveryClaim();
  const runner = cronRunner;
  let ran = 0;
  try {
    const driver = new ScheduledCrons();
    driver.schedule({
      key: "hardening:port-body",
      schedule: { every: Duration.minutes(1) },
      run: () => {
        ran++;
      },
    });

    runner.start(Duration.milliseconds(10_000));
    await time.tickAsync(60_000);
    await time.runMicrotasks();

    assertEquals(ran, 1, "the driver dropped options.run and armed a body that resolves");
  } finally {
    runner.stop();
    claim.restore();
    time.restore();
  }
});

Scribe.test("ScheduledCrons answers the same run for a key declared twice", () => {
  const driver = new ScheduledCrons();
  const options = {
    key: "hardening:port-twice",
    schedule: { every: Duration.minutes(1) },
    run: noop,
  };

  assertEquals(driver.schedule(options), driver.schedule(options));
});

Scribe.test("ScheduledCrons drops the zone the port named, and says nothing", () => {
  const driver = new ScheduledCrons();

  const armed = driver.schedule({
    key: "hardening:port-zone",
    schedule: { expression: "0 3 * * *" },
    timezone: "Pacific/Auckland",
    run: noop,
  });

  assertEquals(Object.keys(armed).includes("timezone"), false);
});

Scribe.test("a busy job burns the occurrences it sleeps through rather than queueing them", async () => {
  const time = new FakeTime(new Date("2026-01-01T00:00:00.000Z"));
  const claim = grantingEveryClaim();
  const runner = new CronRunner();
  try {
    let started = 0;
    const releases: Array<() => void> = [];
    runner.register(intervalJob("hardening:burn", 1), () => {
      started++;
      return new Promise<void>((resolve) => releases.push(resolve));
    });

    runner.start(Duration.milliseconds(10_000));
    await time.tickAsync(60_000);
    await time.runMicrotasks();
    assertEquals(started, 1);

    await time.tickAsync(300_000);
    await time.runMicrotasks();
    assertEquals(started, 1, "five occurrences came and went while the first body hung");

    releases[0]();
    await time.tickAsync(60_000);
    await time.runMicrotasks();
    assertEquals(started, 2, "only the next occurrence ran, and the five are gone for good");

    releases[1]?.();
  } finally {
    runner.stop();
    claim.restore();
    time.restore();
  }
});

Scribe.test("a clock that goes back an hour holds an interval job for that hour", async () => {
  const time = new FakeTime(new Date("2026-01-01T00:00:00.000Z"));
  const claim = grantingEveryClaim();
  const clock = new MovableNow(Date.parse("2026-01-01T00:00:00.000Z"));
  const runner = new CronRunner();
  Now.use(clock);
  try {
    let calls = 0;
    runner.register(intervalJob("hardening:rewound", 1), () => {
      calls++;
      return Promise.resolve();
    });

    runner.start(Duration.milliseconds(10_000));
    clock.at += 60_000;
    await time.tickAsync(60_000);
    await time.runMicrotasks();
    assertEquals(calls, 1);

    clock.at -= 3_600_000;
    for (let minute = 0; minute < 5; minute++) {
      clock.at += 60_000;
      await time.tickAsync(60_000);
      await time.runMicrotasks();
    }

    assertEquals(
      calls,
      1,
      "the job stays silent until the clock climbs back to the occurrence it already holds",
    );
  } finally {
    runner.stop();
    claim.restore();
    Now.use(new SystemNow());
    time.restore();
  }
});

Scribe.test("restarting the loop cannot double the cap, because every in-flight job still holds its token", async () => {
  {
    const time = new FakeTime(new Date("2026-01-01T00:00:00.000Z"));
    const claim = grantingEveryClaim();
    const runner = new CronRunner();
    try {
      let inFlight = 0;
      let peak = 0;
      const releases: Array<() => void> = [];
      for (let i = 0; i < 6; i++) {
        runner.register(intervalJob(`hardening:restart-${i}`, 1), () => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          return new Promise<void>((resolve) =>
            releases.push(() => {
              inFlight--;
              resolve();
            })
          );
        });
      }

      runner.start(Duration.milliseconds(10_000), 2);
      await time.tickAsync(60_000);
      await time.runMicrotasks();
      assertEquals(peak, 2);

      runner.stop();
      await time.tickAsync(10_000);
      runner.start(Duration.milliseconds(10_000), 2);
      await time.tickAsync(60_000);
      await time.runMicrotasks();

      assertEquals(
        peak,
        2,
        "start() built a second semaphore while two bodies held a place on the first, and the " +
          "run token of each job is what kept a third body from taking one",
      );

      for (const release of releases) release();
      await time.runMicrotasks();
    } finally {
      runner.stop();
      claim.restore();
      time.restore();
    }
  }
});

Scribe.test("start() called twice keeps the first loop and ignores the second cap", async () => {
  const time = new FakeTime(new Date("2026-01-01T00:00:00.000Z"));
  const claim = grantingEveryClaim();
  const runner = new CronRunner();
  try {
    let inFlight = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    for (let i = 0; i < 6; i++) {
      runner.register(intervalJob(`hardening:twice-${i}`, 1), () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        return new Promise<void>((resolve) =>
          releases.push(() => {
            inFlight--;
            resolve();
          })
        );
      });
    }

    runner.start(Duration.milliseconds(10_000), 2);
    runner.start(Duration.milliseconds(10_000), 6);
    await time.tickAsync(60_000);
    await time.runMicrotasks();

    assertEquals(peak, 2, "the second start() was refused, cap included");

    for (const release of releases) release();
    await time.runMicrotasks();
  } finally {
    runner.stop();
    claim.restore();
    time.restore();
  }
});
