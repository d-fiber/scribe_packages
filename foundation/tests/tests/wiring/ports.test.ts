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
import {
  assert,
  assertEquals,
  assertNotStrictEquals,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";

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

Deno.test("opening one queue key twice declares it once", () => {
  const key = unique("ports:queue");
  const driver = new NatsQueues();

  const first = driver.open({ key });
  const second = driver.open({ key });

  assertNotStrictEquals(first, second);
  assert(queueRegistry.get(key) !== null, "the declaration a push needs is missing");
});

Deno.test("consuming a key nobody opened declares it, so a runner has something to drain", () => {
  const key = unique("ports:consume");

  new NatsQueues().consume({ key });

  assert(queueRegistry.get(key) !== null);
});

Deno.test("the handler a queue was opened with is called with the message and not the payload", async () => {
  const key = unique("ports:handled");
  const seen: PortMessage<never>[] = [];

  new NatsQueues().open({ key, handle: (message) => void seen.push(message) });
  const declared = queueRegistry.get(key);
  assert(declared !== null);

  await (declared.handler as (data: unknown, message: unknown) => Promise<void>)(
    { a: 1 },
    { id: "m-1", data: { a: 1 }, attempts: 2 },
  );

  assertEquals(seen.length, 1);
  assertEquals(seen[0].id, "m-1");
  assertEquals(seen[0].attempts, 2);
});

Deno.test({
  name: "a queue opened without attempts is handed over once, where the driver gives it five",
  fn() {
    const key = unique("ports:attempts");

    new NatsQueues().open({ key });

    assertEquals(queueRegistry.get(key)?.maxRetries, 1);
  },
});

Deno.test({
  name: "the visibility a queue was opened with reaches the declaration instead of being dropped",
  fn() {
    const key = unique("ports:visibility");

    new NatsQueues().open({ key, visibility: Duration.seconds(90) });

    assertEquals(queueRegistry.get(key)?.processingTimeoutMs, 90_000);
  },
});

Deno.test("the attempts a queue was opened with reach the declaration", () => {
  const key = unique("ports:attempts-given");

  new NatsQueues().open({ key, attempts: 3 });

  assertEquals(queueRegistry.get(key)?.maxRetries, 3);
});

Deno.test("opening one hook event twice answers one chain", async () => {
  const event = unique("ports.hook");
  const driver = new InlineHooks();
  const heard: number[] = [];

  driver.open<number>({ event }).on((payload) => void heard.push(payload));
  await driver.open<number>({ event }).emit(7);

  assertEquals(heard, [7], "a second open must not start a chain of its own");
});

Deno.test("an event nobody listens for is emitted without raising", async () => {
  const event = unique("ports.silent");

  await new InlineHooks().open<number>({ event }).emit(1);
});

Deno.test("two listeners on one event are both called", async () => {
  const event = unique("ports.two");
  const point = new InlineHooks().open<string>({ event });
  const heard: string[] = [];

  point.on((payload) => void heard.push(`first:${payload}`));
  point.on((payload) => void heard.push(`second:${payload}`));
  await point.emit("x");

  assertEquals(heard.length, 2);
});

Deno.test("a listener that raises is not swallowed into a resolved emit", async () => {
  const event = unique("ports.raises");
  const point = new InlineHooks().open<string>({ event });
  point.on(() => {
    throw new Error("the listener refused");
  });

  await assertRejects(() => point.emit("x"), Error, "the listener refused");
});

Deno.test("a scheduled run answers the key and the schedule it was given", () => {
  const armed = capturedCron();
  const key = unique("ports:cron");

  try {
    const run = new ScheduledCrons().schedule({
      key,
      schedule: { every: Duration.minutes(5) },
      run: () => {},
    });

    assertEquals(run.key, key);
    assertEquals(run.schedule, { every: Duration.minutes(5) });
  } finally {
    armed.restore();
  }
});

Deno.test("an interval and an expression translate, and an expression that parses to nothing is refused", () => {
  const armed = capturedCron();

  try {
    const driver = new ScheduledCrons();
    driver.schedule({ key: unique("ports:every"), schedule: { every: Duration.hours(1) }, run: () => {} });
    driver.schedule({ key: unique("ports:expr"), schedule: { expression: "0 8 * * *" }, run: () => {} });

    assertThrows(() =>
      driver.schedule({ key: unique("ports:bad"), schedule: { expression: "not a cron" }, run: () => {} })
    );
  } finally {
    armed.restore();
  }
});

Deno.test("an hour and a minute are written as the text a calendar reads, padded on both", () => {
  const armed = capturedCron();

  try {
    const driver = new ScheduledCrons();
    driver.schedule({ key: unique("ports:at"), schedule: { at: { hour: 8, minute: 30 } }, run: () => {} });
    driver.schedule({ key: unique("ports:at-sharp"), schedule: { at: { hour: 8 } }, run: () => {} });

    assertEquals((armed.armed[0][0].schedule as { times: readonly string[] }).times, ["08:30"]);
    assertEquals((armed.armed[1][0].schedule as { times: readonly string[] }).times, ["08:00"]);
  } finally {
    armed.restore();
  }
});

Deno.test("a time of day whose hour is out of range is refused where it is written", () => {
  const armed = capturedCron();

  try {
    assertThrows(
      () =>
        new ScheduledCrons().schedule({ key: unique("ports:bad-hour"), schedule: { at: { hour: 99 } }, run: () => {} }),
      Error,
      "99",
    );
  } finally {
    armed.restore();
  }
});

Deno.test({
  name: "a zone this package does not read is refused as a declaration error, not as a range error from croner",
  fn() {
    const armed = capturedCron();

    try {
      assertThrows(
        () =>
          new ScheduledCrons().schedule({
            key: unique("ports:bad-zone"),
            schedule: { at: { hour: 8 } },
            timezone: "Mars/Olympus",
            run: () => {},
          }),
        DeclarationError,
      );
    } finally {
      armed.restore();
    }
  },
});

Deno.test({
  name: "the body a scheduled run was declared with is what the runner fires",
  async fn() {
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

      assertEquals(armed.armed.length, 1);
      await armed.armed[0][1]();

      assertEquals(ran, 1, "a key is a name and a name is not a body");
    } finally {
      armed.restore();
    }
  },
});

Deno.test({
  name: "the zone a scheduled run was declared in is the one it is read in",
  fn() {
    const armed = capturedCron();

    try {
      new ScheduledCrons().schedule({
        key: unique("ports:zone"),
        schedule: { at: { hour: 8 } },
        timezone: "Europe/Paris",
        run: () => {},
      });

      const schedule = armed.armed[0][0].schedule as { timezone?: string };
      assertEquals(schedule.timezone, "Europe/Paris");
    } finally {
      armed.restore();
    }
  },
});

Deno.test("a watch that names no key answers to id", () => {
  const table = unique("orders");

  new OutboxTriggers().watch(table).onInsert(() => {});

  assertEquals(triggerRegistry.list().find((one) => one.table === table)?.key, "id");
});

Deno.test({
  name: "the key column a watch was declared with reaches the registry, where the driver only labels the path with it",
  fn() {
    const table = unique("orders");

    new OutboxTriggers().watch(table, { key: "reference" }).onInsert(() => {});

    assertEquals(triggerRegistry.list().find((one) => one.table === table)?.key, "reference");
  },
});

Deno.test({
  name: "the name a watch was declared with is what it registers under, where the driver drops it",
  fn() {
    const table = unique("orders");

    new OutboxTriggers().watch(table, { name: "orders-arrived" }).onInsert(() => {});

    assertEquals(triggerRegistry.list().some((one) => one.name === "orders-arrived"), true);
  },
});

Deno.test({
  name: "the queue options a watch was declared with reach its queue, where the driver drops them",
  fn() {
    const table = unique("orders");

    new OutboxTriggers().watch(table, { queue: { key: table, attempts: 9 } }).onInsert(() => {});

    assertEquals(queueRegistry.get(`trigger:${table}:insert`)?.maxRetries, 9);
  },
});

Deno.test("every method of a watch answers the watch itself, so a chain reads as one declaration", () => {
  const table = unique("chained");
  const watch = new OutboxTriggers().watch<{ id: string; total: number }>(table);

  const back = watch.onInsert(() => {}).onUpdate(() => {}).onDelete(() => {});

  assertStrictEquals(back, watch);
});

Deno.test("a change handed to a body carries the table, the key and the instant of the write", async () => {
  const table = unique("carried");
  const seen: Array<{ table: string; key: string; at: DateTime; op: string }> = [];

  new OutboxTriggers().watch<{ id: string }>(table).onInsert((change) => {
    seen.push({ table: change.table, key: change.key, at: change.at, op: change.op });
  });

  const declared = queueRegistry.get(`trigger:${table}:insert`);
  assert(declared !== null, "a declaration publishes on a queue of its own");

  await (declared.handler as (data: unknown, message: unknown) => Promise<void>)(
    { table, key: "7", op: "insert", at: "2026-01-01T00:00:00.000Z", after: { id: "7" } },
    { id: "m", data: {}, attempts: 1 },
  );

  assertEquals(seen.length, 1);
  assertEquals(seen[0].table, table);
  assertEquals(seen[0].key, "7");
  assertEquals(seen[0].op, "insert");
});

Deno.test({
  name: "a change on one column says it is an update, where the driver says field, which the port does not declare",
  async fn() {
    const table = unique("field-op");
    const seen: string[] = [];

    new OutboxTriggers().watch<{ id: string; total: number }>(table).onField("total", (change) => {
      seen.push(change.op);
    });

    const declared = queueRegistry.get(`trigger:${table}:total`);
    assert(declared !== null);

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

    assertEquals(seen, ["update"]);
  },
});

Deno.test("a query on a table answers every member the port declares", () => {
  const query = new PostgrestDatabases().table<{ orders: { row: { id: string } } }, "orders">("orders");

  for (
    const member of ["where", "limit", "range", "get", "getOne", "insert", "insertOne", "update", "delete", "deleteOne"]
  ) {
    assertEquals(
      typeof (query as unknown as Record<string, unknown>)[member],
      "function",
      `a query answers no ${member}`,
    );
  }
});

Deno.test("a write naming no row is refused rather than run", async () => {
  const logged = recordLog();
  const query = new PostgrestDatabases().table<{ orders: { row: { id: string } } }, "orders">("orders");

  const answered = await query.delete();

  assertEquals(answered.ok, false, "a delete with no filter would take the whole table");
  logged.restore();
});

Deno.test("a rate limit answers to the key it was opened with, and says nothing was measured as allowed", () => {
  const limiter = new RedisRateLimiters().open({
    key: "ports:limit",
    limit: 10,
    window: Duration.minutes(1),
    penalty: Duration.minutes(5),
  });

  assertEquals(limiter.key, "ports:limit");
  assertEquals(limiter.unmeasured().ok, true, "a caller is never told it went over on a call nobody counted");
});
