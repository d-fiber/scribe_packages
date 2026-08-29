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
import "@scribe/testing/runner.ts";
import { equals, expect, isNot, Scribe } from "@scribe/alchemy/test";
import "../../testing/settings.ts";

import { Duration } from "@scribe/alchemy";
import { installDrivers } from "../../testing/drivers.ts";
import { nextRun } from "../../../lib/src/cron/next_run.ts";
import { SlotLock } from "../../../lib/src/cron/slot_lock.ts";
import { at } from "../../../lib/src/cron/daily_schedule.ts";
import { CronTimezone } from "../../../lib/src/cron/cron_timezone.ts";
import type { Scheduled } from "../../../lib/src/cron/schedule.ts";
import { kv } from "../../../lib/src/redis/kv.ts";
import { recordLog } from "../../testing/logger.ts";

function everyMinutes(name: string, minutes: number, timeout = Duration.minutes(10)): Scheduled {
  return { name, schedule: { kind: "interval", every: Duration.minutes(minutes) }, timeout };
}

function answering(reply: unknown): { restore(): void } {
  const target = kv() as unknown as Record<string, unknown>;
  const had = Object.prototype.hasOwnProperty.call(target, "set");
  const original = target.set;

  target.set = () => Promise.resolve(reply);

  return {
    restore(): void {
      if (had) target.set = original;
      else delete target.set;
    },
  };
}

installDrivers();

const lock = new SlotLock();

Scribe.test("two replicas anywhere inside one cell claim the same key", () => {
  const job = everyMinutes("fleet:cleanup", 1);
  const cell = 1_800_000_000_000;
  const expected = lock.keyFor(job, new Date(cell));

  for (const offset of [0, 1, 999, 30_000, 59_998, 59_999]) {
    expect(lock.keyFor(job, new Date(cell + offset)), equals(expected), `slot at cell+${offset} ms`);
  }
});

Scribe.test("two replicas whose slots straddle a cell boundary by one millisecond both run", () => {
  const every = Duration.minutes(1);
  const boundary = 1_800_000_000_000;

  expect(
    nextRun({ kind: "interval", every }, new Date(boundary - 1)),
    equals(nextRun({ kind: "interval", every }, new Date(boundary - 60_000))),
    "an interval counted from whenever a replica registered gives every replica a series of " +
      "its own, so a process started one millisecond earlier claims occurrences no other " +
      "replica ever computes",
  );
});

Scribe.test("a slot before 1970 still floors onto the same grid for every replica", () => {
  const job = everyMinutes("fleet:archaic", 1);

  expect(lock.keyFor(job, new Date(-1)), equals(lock.keyFor(job, new Date(-59_999))));
  expect(lock.keyFor(job, new Date(-1)), equals("cron:lock:fleet:archaic:-60000"));
});

Scribe.test("a job name holding the key separator cannot be confused with another job", () => {
  const plain = everyMinutes("sweep", 1);
  const nested = everyMinutes("sweep:1", 1);

  expect(lock.keyFor(plain, new Date(60_000)), isNot(equals(lock.keyFor(nested, new Date(60_000)))));
  expect(lock.keyFor(nested, new Date(60_000)), equals("cron:lock:sweep:1:60000"));
});

Scribe.test("a job name is written into the key as it was declared, glob characters included", () => {
  const globbed = everyMinutes("sweep:*", 1);

  expect(
    lock.keyFor(globbed, new Date(60_000)),
    equals("cron:lock:sweep:*:60000"),
    "nothing escapes the name, so an operator scanning cron:lock:sweep:* sweeps this job too",
  );
});

Scribe.test("a ten thousand character job name is carried into the key whole", () => {
  const long = everyMinutes("x".repeat(10_000), 1);

  expect(lock.keyFor(long, new Date(60_000)).length, equals(10_000 + "cron:lock::60000".length));
});

Scribe.test("a one minute interval keeps the marker for the timeout, not for the minute", () => {
  const job = everyMinutes("fleet:minute", 1);

  expect(lock.leaseFor(job, new Date(60_000)).inMinutes, equals(10));
});

Scribe.test("a timeout longer than the interval does not stop a replica taking the next occurrence", () => {
  const job = everyMinutes("fleet:overrun", 1);
  const slot = new Date(60_000);
  const nextSlot = new Date(120_000);

  expect(lock.keyFor(job, slot), isNot(equals(lock.keyFor(job, nextSlot))));
  expect(
    lock.leaseFor(job, slot).inMilliseconds > nextSlot.getTime() - slot.getTime(),
    equals(true),
    "the marker of one occurrence outlives that occurrence, and the next one is a free key: " +
      "ten replicas can be inside the same body, on ten consecutive minutes",
  );
});

Scribe.test("a daily lease covers the whole day the occurrence names", () => {
  const daily: Scheduled = {
    name: "fleet:digest",
    schedule: at(CronTimezone.Utc, "08:00"),
    timeout: Duration.minutes(10),
  };

  expect(lock.leaseFor(daily, new Date("2026-01-01T08:00:00.000Z")).inMilliseconds, equals(86_400_000));
});

Scribe.test("claim() answers yes only on the exact reply the store promises", async () => {
  const job = everyMinutes("fleet:reply", 1);
  const slot = new Date(60_000);

  for (const [reply, expected] of [["OK", true], [null, false], ["ok", false]] as const) {
    const shadow = answering(reply);
    try {
      expect(await lock.claim(job, slot), equals(expected), `the store answered ${String(reply)}`);
    } finally {
      shadow.restore();
    }
  }
});

Scribe.test("claim() cannot tell a lost race from a store answering something it does not understand", async () => {
  const job = everyMinutes("fleet:mute", 1);
  const shadow = answering(42);
  const logs = recordLog();
  try {
    expect(await lock.claim(job, new Date(60_000)), equals(false));
    expect(
      logs.lines.length > 0,
      equals(true),
      "every occurrence of every job is skipped for as long as the store answers this, and " +
        "nothing is written down",
    );
  } finally {
    shadow.restore();
  }
});

Scribe.test("claim() answers no and says so when the store is unreachable", async () => {
  const job = everyMinutes("fleet:down", 1);
  const target = kv() as unknown as Record<string, unknown>;
  const had = Object.prototype.hasOwnProperty.call(target, "set");
  const original = target.set;
  target.set = () => Promise.reject(new Error("redis down"));
  const logs = recordLog();

  try {
    expect(await lock.claim(job, new Date(60_000)), equals(false));
    expect(logs.actions.includes("cron-runner.lock_unavailable"), equals(true));
  } finally {
    if (had) target.set = original;
    else delete target.set;
  }
});
