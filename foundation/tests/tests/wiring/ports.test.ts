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
import {
  allOf,
  equals,
  expect,
  expectLater,
  fail,
  isA,
  isNot,
  isNotNull,
  isTrue,
  same,
  Scribe,
  throwsA,
  withMessage,
} from "@scribe/alchemy/test";
import "../../testing/settings.ts";
import { installDrivers } from "../../testing/drivers.ts";
import { DateTime, DeclarationError, Duration } from "@scribe/alchemy";
import type { CronHandler, Scheduled } from "../../../lib/src/cron/schedule.ts";
import type { QueueMessage as PortMessage } from "@scribe/alchemy";
import { NatsQueues } from "../../../lib/src/queue/nats_queues.ts";
import { InlineHooks } from "../../../lib/src/hook/inline_hooks.ts";
import { ScheduledCrons } from "../../../lib/src/cron/scheduled_crons.ts";
import { OutboxTriggers } from "../../../lib/src/trigger/outbox_triggers.ts";
import { PostgrestDatabases } from "../../../lib/src/database/postgrest_databases.ts";
import { RedisRateLimiters } from "../../../lib/src/rate_limit/redis_rate_limiter.ts";
import { queueRegistry } from "../../../lib/src/queue/queue_registry.ts";
import { triggerRegistry } from "../../../lib/src/trigger/trigger_registry.ts";
import { cronRunner } from "../../../lib/src/cron/cron_runner.ts";
import { installMock } from "../../testing/install.ts";
import { recordLog } from "../../testing/logger.ts";
installDrivers();

let counter = 0;

function unique(prefix: string): string {
  return `${prefix}-${++counter}`;
}

function capturedCron(): { armed: Array<[Scheduled, CronHandler]>; restore(): void } {
  const armed: Array<[Scheduled, CronHandler]> = [];
  const mock = installMock(cronRunner, "register", (job: Scheduled, handler: CronHandler) => {
    armed.push([job, handler]);
  });
  return { armed, restore: () => mock.restore() };
}

Scribe.test("opening one queue key twice declares it once", () => {
  const key = unique("ports:queue");
  const driver = new NatsQueues();

  const first = driver.open({ key });
  const second = driver.open({ key });

  expect(first, isNot(same(second)));
  expect(queueRegistry.get(key) !== null, isTrue, "the declaration a push needs is missing");
});

Scribe.test("consuming a key nobody opened declares it, so a runner has something to drain", () => {
  const key = unique("ports:consume");

  new NatsQueues().consume({ key });

  expect(queueRegistry.get(key) !== null, isTrue);
});

Scribe.test("the handler a queue was opened with is called with the message and not the payload", async () => {
  const key = unique("ports:handled");
  const seen: PortMessage<never>[] = [];

  new NatsQueues().open({ key, handle: (message) => void seen.push(message) });
  const declared = queueRegistry.get(key);
  if (declared === null) fail("this queue must have registered a handler");

  await (declared.handler as (data: unknown, message: unknown) => Promise<void>)(
    { a: 1 },
    { id: "m-1", data: { a: 1 }, attempts: 2 },
  );

  expect(seen.length, equals(1));
  expect(seen[0].id, equals("m-1"));
  expect(seen[0].attempts, equals(2));
});

Scribe.test("a queue opened without attempts is handed over once, where the driver gives it five", () => {
  const key = unique("ports:attempts");

  new NatsQueues().open({ key });

  expect(queueRegistry.get(key)?.maxRetries, equals(1));
});

Scribe.test("the visibility a queue was opened with reaches the declaration instead of being dropped", () => {
  const key = unique("ports:visibility");

  new NatsQueues().open({ key, visibility: Duration.seconds(90) });

  expect(queueRegistry.get(key)?.processingTimeoutMs, equals(90_000));
});

Scribe.test("the attempts a queue was opened with reach the declaration", () => {
  const key = unique("ports:attempts-given");

  new NatsQueues().open({ key, attempts: 3 });

  expect(queueRegistry.get(key)?.maxRetries, equals(3));
});

Scribe.test("opening one hook event twice answers one chain", async () => {
  const event = unique("ports.hook");
  const driver = new InlineHooks();
  const heard: number[] = [];

  driver.open<number>({ event }).on((payload) => void heard.push(payload));
  await driver.open<number>({ event }).emit(7);

  expect(heard, equals([7]), "a second open must not start a chain of its own");
});

Scribe.test("an event nobody listens for is emitted without raising", async () => {
  const event = unique("ports.silent");

  await new InlineHooks().open<number>({ event }).emit(1);
});

Scribe.test("two listeners on one event are both called", async () => {
  const event = unique("ports.two");
  const point = new InlineHooks().open<string>({ event });
  const heard: string[] = [];

  point.on((payload) => void heard.push(`first:${payload}`));
  point.on((payload) => void heard.push(`second:${payload}`));
  await point.emit("x");

  expect(heard.length, equals(2));
});

Scribe.test("a listener that raises is not swallowed into a resolved emit", async () => {
  const event = unique("ports.raises");
  const point = new InlineHooks().open<string>({ event });
  point.on(() => {
    throw new Error("the listener refused");
  });

  await expectLater(() => point.emit("x"), throwsA(allOf(isA(Error), withMessage("the listener refused"))));
});

Scribe.test("a scheduled run answers the key and the schedule it was given", () => {
  const armed = capturedCron();
  const key = unique("ports:cron");

  try {
    const run = new ScheduledCrons().schedule({
      key,
      schedule: { every: Duration.minutes(5) },
      run: () => {},
    });

    expect(run.key, equals(key));
    expect(run.schedule, equals({ every: Duration.minutes(5) }));
  } finally {
    armed.restore();
  }
});

Scribe.test("an interval and an expression translate, and an expression that parses to nothing is refused", () => {
  const armed = capturedCron();

  try {
    const driver = new ScheduledCrons();
    driver.schedule({ key: unique("ports:every"), schedule: { every: Duration.hours(1) }, run: () => {} });
    driver.schedule({ key: unique("ports:expr"), schedule: { expression: "0 8 * * *" }, run: () => {} });

    expect(
      () => driver.schedule({ key: unique("ports:bad"), schedule: { expression: "not a cron" }, run: () => {} }),
      throwsA(isNotNull),
    );
  } finally {
    armed.restore();
  }
});

Scribe.test("an hour and a minute are written as the text a calendar reads, padded on both", () => {
  const armed = capturedCron();

  try {
    const driver = new ScheduledCrons();
    driver.schedule({ key: unique("ports:at"), schedule: { at: { hour: 8, minute: 30 } }, run: () => {} });
    driver.schedule({ key: unique("ports:at-sharp"), schedule: { at: { hour: 8 } }, run: () => {} });

    expect((armed.armed[0][0].schedule as { times: readonly string[] }).times, equals(["08:30"]));
    expect((armed.armed[1][0].schedule as { times: readonly string[] }).times, equals(["08:00"]));
  } finally {
    armed.restore();
  }
});

Scribe.test("a time of day whose hour is out of range is refused where it is written", () => {
  const armed = capturedCron();

  try {
    expect(
      () =>
        new ScheduledCrons().schedule({ key: unique("ports:bad-hour"), schedule: { at: { hour: 99 } }, run: () => {} }),
      throwsA(allOf(isA(Error), withMessage("99"))),
    );
  } finally {
    armed.restore();
  }
});

Scribe.test("a zone this package does not read is refused as a declaration error, not as a range error from croner", () => {
  const armed = capturedCron();

  try {
    expect(() =>
      new ScheduledCrons().schedule({
        key: unique("ports:bad-zone"),
        schedule: { at: { hour: 8 } },
        timezone: "Mars/Olympus",
        run: () => {},
      }), throwsA(isA(DeclarationError)));
  } finally {
    armed.restore();
  }
});

Scribe.test("the body a scheduled run was declared with is what the runner fires", async () => {
  const armed = capturedCron();
  let ran = 0;

  try {
    new ScheduledCrons().schedule({
      key: unique("ports:body"),
      schedule: { every: Duration.minutes(1) },
      run: () => {
        ran++;
      },
    });

    expect(armed.armed.length, equals(1));
    await armed.armed[0][1]();

    expect(ran, equals(1), "a key is a name and a name is not a body");
  } finally {
    armed.restore();
  }
});

Scribe.test("the zone a scheduled run was declared in is the one it is read in", () => {
  const armed = capturedCron();

  try {
    new ScheduledCrons().schedule({
      key: unique("ports:zone"),
      schedule: { at: { hour: 8 } },
      timezone: "Europe/Paris",
      run: () => {},
    });

    const schedule = armed.armed[0][0].schedule as { timezone?: string };
    expect(schedule.timezone, equals("Europe/Paris"));
  } finally {
    armed.restore();
  }
});

Scribe.test("a watch that names no key answers to id", () => {
  const table = unique("orders");

  new OutboxTriggers().watch(table).onInsert(() => {});

  expect(triggerRegistry.list().find((one) => one.table === table)?.key, equals("id"));
});

Scribe.test("the key column a watch was declared with reaches the registry, where the driver only labels the path with it", () => {
  const table = unique("orders");

  new OutboxTriggers().watch(table, { key: "reference" }).onInsert(() => {});

  expect(triggerRegistry.list().find((one) => one.table === table)?.key, equals("reference"));
});

Scribe.test("the name a watch was declared with is what it registers under, where the driver drops it", () => {
  const table = unique("orders");

  new OutboxTriggers().watch(table, { name: "orders-arrived" }).onInsert(() => {});

  expect(triggerRegistry.list().some((one) => one.name === "orders-arrived"), equals(true));
});

Scribe.test("the queue options a watch was declared with reach its queue, where the driver drops them", () => {
  const table = unique("orders");

  new OutboxTriggers().watch(table, { queue: { key: table, attempts: 9 } }).onInsert(() => {});

  expect(queueRegistry.get(`trigger:${table}:insert`)?.maxRetries, equals(9));
});

Scribe.test("every method of a watch answers the watch itself, so a chain reads as one declaration", () => {
  const table = unique("chained");
  const watch = new OutboxTriggers().watch<{ id: string; total: number }>(table);

  const back = watch.onInsert(() => {}).onUpdate(() => {}).onDelete(() => {});

  expect(back, same(watch));
});

Scribe.test("a change handed to a body carries the table, the key and the instant of the write", async () => {
  const table = unique("carried");
  const seen: Array<{ table: string; key: string; at: DateTime; op: string }> = [];

  new OutboxTriggers().watch<{ id: string }>(table).onInsert((change) => {
    seen.push({ table: change.table, key: change.key, at: change.at, op: change.op });
  });

  const declared = queueRegistry.get(`trigger:${table}:insert`);
  if (declared === null) fail("a declaration publishes on a queue of its own");

  await (declared.handler as (data: unknown, message: unknown) => Promise<void>)(
    { table, key: "7", op: "insert", at: "2026-01-01T00:00:00.000Z", after: { id: "7" } },
    { id: "m", data: {}, attempts: 1 },
  );

  expect(seen.length, equals(1));
  expect(seen[0].table, equals(table));
  expect(seen[0].key, equals("7"));
  expect(seen[0].op, equals("insert"));
});

Scribe.test("a change on one column says it is an update, where the driver says field, which the port does not declare", async () => {
  const table = unique("field-op");
  const seen: string[] = [];

  new OutboxTriggers().watch<{ id: string; total: number }>(table).onField("total", (change) => {
    seen.push(change.op);
  });

  const declared = queueRegistry.get(`trigger:${table}:total`);
  if (declared === null) fail("this queue must have registered a handler");

  await (declared.handler as (data: unknown, message: unknown) => Promise<void>)(
    {
      table,
      key: "7",
      op: "update",
      at: "2026-01-01T00:00:00.000Z",
      before: { id: "7", total: 1 },
      after: { id: "7", total: 2 },
    },
    { id: "m", data: {}, attempts: 1 },
  );

  expect(seen, equals(["update"]));
});

Scribe.test("a query on a table answers every member the port declares", () => {
  const query = new PostgrestDatabases().table<{ orders: { row: { id: string } } }, "orders">("orders");

  for (
    const member of ["where", "limit", "range", "get", "getOne", "insert", "insertOne", "update", "delete", "deleteOne"]
  ) {
    expect(
      typeof (query as unknown as Record<string, unknown>)[member],
      equals("function"),
      `a query answers no ${member}`,
    );
  }
});

Scribe.test("a write naming no row is refused rather than run", async () => {
  const logged = recordLog();
  const query = new PostgrestDatabases().table<{ orders: { row: { id: string } } }, "orders">("orders");

  const answered = await query.delete();

  expect(answered.ok, equals(false), "a delete with no filter would take the whole table");
  logged.restore();
});

Scribe.test("a rate limit answers to the key it was opened with, and says nothing was measured as allowed", () => {
  const limiter = new RedisRateLimiters().open({
    key: "ports:limit",
    limit: 10,
    window: Duration.minutes(1),
    penalty: Duration.minutes(5),
  });

  expect(limiter.key, equals("ports:limit"));
  expect(limiter.unmeasured().ok, equals(true), "a caller is never told it went over on a call nobody counted");
});
