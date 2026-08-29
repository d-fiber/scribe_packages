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
import "@scribe/testing/runner.ts";
import { equals, expect, Scribe } from "@scribe/alchemy/test";
import { installDrivers } from "../../testing/drivers.ts";
import { type Kv, kv } from "../../../lib/src/redis/kv.ts";
import { Queue } from "../../../lib/src/queue/queue.ts";
import { pushDelayed } from "../../../lib/src/queue/delayed/delayed_schedule.ts";
import { promoteDue } from "../../../lib/src/queue/delayed/delayed_promoter.ts";
import { delayedCounts } from "../../../lib/src/queue/delayed/delayed_counts.ts";
import { encodeMember } from "../../../lib/src/queue/delayed/delayed_member.ts";
import { topology } from "../../../lib/src/queue/topology/topology.ts";
import { ensureTopology } from "../../../lib/src/queue/topology/ensure_topology.ts";
import { installMock } from "../../testing/install.ts";
import { Duration, Now } from "@scribe/alchemy";
import { FixedNow } from "@scribe/alchemy/test";
installDrivers();

const EPOCH = 1_800_000_000_000;

interface Parked {
  readonly score: number;
  readonly raw: string;
}

function holdKv() {
  const parked: Parked[] = [];
  const removed: string[] = [];

  const mocks = [
    installMock(
      kv(),
      "zadd",
      ((_key: string, score: number, raw: string) => {
        parked.push({ score, raw });
        return Promise.resolve(1);
      }) as unknown as Kv["zadd"],
    ),
    installMock(
      kv(),
      "zrem",
      ((_key: string, raw: string) => {
        const already = removed.includes(raw);
        removed.push(raw);
        return Promise.resolve(already ? 0 : 1);
      }) as unknown as Kv["zrem"],
    ),
  ];

  return {
    parked,
    removed,
    restore: () => {
      for (const mock of mocks) mock.restore();
    },
  };
}

function holdClock(at: number): FixedNow {
  const clock = new FixedNow(at);
  Now.use(clock);
  return clock;
}

function member(over: Record<string, unknown> = {}): string {
  return encodeMember({
    id: "m1",
    queue: "test:delayed:target",
    subject: "q.test_delayed_target",
    data: { to: "a@b.c" },
    ...over,
  });
}

new Queue<{ to: string }>({ name: "test:delayed:target" }, () => Promise.resolve());

Scribe.test("a delay of zero is published now instead of being parked", async () => {
  const store = holdKv();
  const published: string[] = [];
  const mocks = [
    installMock(topology, "publish", (subject: string) => {
      published.push(subject);
      return Promise.resolve("9");
    }),
    installMock(topology, "ensure", () => Promise.resolve()),
  ];

  try {
    const queue = new Queue<{ to: string }>(
      { name: "test:delayed:zero" },
      () => Promise.resolve(),
    );
    await queue.push({ to: "a@b.c" }, { delay: Duration.milliseconds(0) });

    expect(store.parked, equals([]));
    expect(published, equals(["q.test_delayed_zero"]));
  } finally {
    for (const mock of mocks) mock.restore();
    store.restore();
  }
});

Scribe.test("a delay in the past is published now instead of being parked", async () => {
  const store = holdKv();
  const published: string[] = [];
  const mocks = [
    installMock(topology, "publish", (subject: string) => {
      published.push(subject);
      return Promise.resolve("9");
    }),
    installMock(topology, "ensure", () => Promise.resolve()),
  ];

  try {
    const queue = new Queue<{ to: string }>(
      { name: "test:delayed:past" },
      () => Promise.resolve(),
    );
    await queue.push({ to: "a@b.c" }, { delay: Duration.hours(-3) });

    expect(
      store.parked,
      equals([]),
      "a negative delay must never reach the sorted set, where its score would sit before " +
        "every honest one and be promoted ahead of jobs that were pushed first",
    );
    expect(published, equals(["q.test_delayed_past"]));
  } finally {
    for (const mock of mocks) mock.restore();
    store.restore();
  }
});

Scribe.test("a parked job scores the instant it becomes due, read from the clock in force", async () => {
  const store = holdKv();
  const clock = holdClock(EPOCH);

  try {
    await pushDelayed("test:delayed:target", "q.test_delayed_target", { to: "a" }, 90_000);

    expect(store.parked.length, equals(1));
    expect(store.parked[0].score, equals(EPOCH + 90_000));
    clock.pass(Duration.minutes(1));
    expect(store.parked[0].score, equals(EPOCH + 90_000));
  } finally {
    store.restore();
    installDrivers();
  }
});

Scribe.test("a clock that walks back between the push and the pass holds the job that long", async () => {
  const store = holdKv();
  const clock = holdClock(EPOCH);
  const due: string[] = [];
  const mock = installMock(
    kv(),
    "zrangebyscore",
    ((_key: string, _min: string, max: number) => {
      due.push(String(max));
      return Promise.resolve(
        store.parked.filter((one) => one.score <= max).map((one) => one.raw),
      );
    }) as unknown as Kv["zrangebyscore"],
  );
  const publishing = installMock(topology, "publish", () => Promise.resolve("1"));

  try {
    await pushDelayed("test:delayed:target", "q.test_delayed_target", { to: "a" }, 1_000);

    clock.set(EPOCH - Duration.hours(1).inMilliseconds);
    expect(await promoteDue(), equals(0));

    clock.set(EPOCH + 1_000);
    expect(
      await promoteDue(),
      equals(1),
      "the score is an absolute instant, so a clock that walks back postpones every parked " +
        "job by exactly what it lost, and nothing about the delay itself says so",
    );
  } finally {
    publishing.restore();
    mock.restore();
    store.restore();
    installDrivers();
  }
});

Scribe.test("an infinite delay parks a job no pass will ever find", async () => {
  const store = holdKv();
  const clock = holdClock(EPOCH);

  try {
    await pushDelayed("test:delayed:target", "q.test_delayed_target", { to: "a" }, Infinity);

    expect(store.parked[0].score, equals(Infinity));
    clock.pass(Duration.days(3_650));
    expect(store.parked[0].score > clock.millisecondsSinceEpoch(), equals(true));
  } finally {
    store.restore();
    installDrivers();
  }
});

Scribe.test("one unreadable member in a due batch never stops the readable ones beside it", async () => {
  const store = holdKv();
  const good = Array.from({ length: 40 }, (_, at) => member({ id: `m${at}` }));
  const due = [...good.slice(0, 20), "{ broken", ...good.slice(20), "]]]"];
  const mocks = [
    installMock(
      kv(),
      "zrangebyscore",
      (() => Promise.resolve(due)) as unknown as Kv["zrangebyscore"],
    ),
    installMock(topology, "publish", () => Promise.resolve("1")),
  ];

  try {
    expect(await promoteDue(), equals(40));
    expect(store.removed.length, equals(42));
  } finally {
    for (const mock of mocks) mock.restore();
    store.restore();
  }
});

Scribe.test("two passes promoting at the same time each count the same job", async () => {
  const store = holdKv();
  const published: string[] = [];
  const mocks = [
    installMock(
      kv(),
      "zrangebyscore",
      (() => Promise.resolve([member()])) as unknown as Kv["zrangebyscore"],
    ),
    installMock(topology, "publish", (subject: string) => {
      published.push(subject);
      return Promise.resolve("1");
    }),
  ];

  try {
    const [first, second] = await Promise.all([promoteDue(), promoteDue()]);

    expect(
      first + second,
      equals(1),
      "one parked job was promoted, and two passes each claimed it: DrainResult.promoted is " +
        "what a status screen reads, and it counts the passes rather than the jobs. ZREM " +
        "answers how many it actually removed, which is the claim nobody reads",
    );
    expect(published.length, equals(2));
  } finally {
    for (const mock of mocks) mock.restore();
    store.restore();
  }
});

Scribe.test("the scan cap is defeated by a backlog of unreadable members", async () => {
  let pages = 0;
  const page = Array.from({ length: 500 }, () => ["{ broken", "1"]).flat();
  const mock = installMock(
    kv(),
    "zscan",
    (() => {
      pages++;
      return Promise.resolve([pages >= 400 ? "0" : String(pages), page] as [string, string[]]);
    }) as unknown as Kv["zscan"],
  );

  try {
    await delayedCounts();

    expect(
      pages <= 200,
      equals(true),
      `the scan walked ${pages} pages: the cap counts readable members only, so a set full ` +
        "of members nothing can read is scanned end to end whatever its size",
    );
  } finally {
    mock.restore();
  }
});

Scribe.test("a scan that reaches its cap says the count is a lower bound", async () => {
  const page = Array.from({ length: 250 }, (_, at) => [member({ id: `p${at}` }), "1"]).flat();
  let pages = 0;
  const mock = installMock(
    kv(),
    "zscan",
    (() => {
      pages++;
      return Promise.resolve(["7", page] as [string, string[]]);
    }) as unknown as Kv["zscan"],
  );

  try {
    const counts = await delayedCounts();

    expect(counts.truncated, equals(true));
    expect(counts.counts["test:delayed:target"] >= 50_000, equals(true));
  } finally {
    mock.restore();
  }
});

Scribe.test("a half answer from the scan is read to its last whole pair", async () => {
  const mock = installMock(
    kv(),
    "zscan",
    (() =>
      Promise.resolve(["0", [member(), "1", member({ queue: "other" })]] as [
        string,
        string[],
      ])) as unknown as Kv["zscan"],
  );

  try {
    const counts = await delayedCounts();

    expect(counts.counts, equals({ "test:delayed:target": 1, other: 1 }));
    expect(counts.truncated, equals(false));
  } finally {
    mock.restore();
  }
});

Scribe.test("ensureTopology is what a delayed push skips, and a plain push does not", async () => {
  const store = holdKv();
  const clock = holdClock(EPOCH);
  let ensured = 0;
  const mocks = [
    installMock(topology, "ensure", () => {
      ensured++;
      return Promise.resolve();
    }),
    installMock(topology, "publish", () => Promise.resolve("1")),
  ];

  try {
    const queue = new Queue<{ to: string }>(
      { name: "test:delayed:skip" },
      () => Promise.resolve(),
    );

    await queue.push({ to: "a" }, { delay: Duration.minutes(5) });
    expect(ensured, equals(0));
    expect(store.parked.length, equals(1));

    await ensureTopology();
    await queue.push({ to: "a" });
    expect(ensured >= 1, equals(true));
    expect(clock.millisecondsSinceEpoch(), equals(EPOCH));
  } finally {
    for (const mock of mocks) mock.restore();
    store.restore();
    installDrivers();
  }
});
