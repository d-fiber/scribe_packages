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

import { installDrivers } from "@scribe/foundation/tests/testing/drivers.ts";
import { Queue } from "@scribe/foundation/lib/src/queue/queue.ts";
import { queueRegistry } from "@scribe/foundation/lib/src/queue/queue_registry.ts";
import { queueStatus } from "@scribe/foundation/lib/src/queue/queue_status.ts";
import { topology } from "@scribe/foundation/lib/src/queue/topology/topology.ts";
import { type Kv, kv } from "@scribe/foundation/lib/src/redis/kv.ts";
import { installMock } from "@scribe/foundation/tests/testing/install.ts";
import { dispatchProbes, probe } from "./probe.ts";
import { assertEquals } from "@std/assert";

installDrivers();

const DEAD_AT = 2;

new Queue<{ id: string }>(
  { name: "test:hot:ok" },
  () => Promise.resolve(),
);
new Queue<{ id: string }>(
  { name: "test:hot:refuses", options: { maxRetries: DEAD_AT } },
  () => Promise.reject(new Error("refused")),
);
new Queue<{ id: string }>(
  { name: "test:hot:group", batch: { lingerMs: 10 }, options: { maxRetries: DEAD_AT } },
  () => Promise.reject(new Error("refused")),
);

function counting() {
  const calls: string[] = [];
  const mocks = [
    installMock(topology, "countBySubject", (stream: string, subject: string) => {
      calls.push(`count:${stream}:${subject}`);
      return Promise.resolve(0);
    }),
    installMock(topology, "ensure", () => {
      calls.push("ensure");
      return Promise.resolve();
    }),
    installMock(
      kv(),
      "zscan",
      (() => {
        calls.push("zscan");
        return Promise.resolve(["0", []] as [string, string[]]);
      }) as unknown as Kv["zscan"],
    ),
  ];

  return {
    calls,
    restore: () => {
      for (const mock of mocks) mock.restore();
    },
  };
}

Deno.test("a message that succeeds is decoded exactly once", async () => {
  const reads = { count: 0 };

  await dispatchProbes([probe({ subject: "q.test_hot_ok", data: { id: "a" }, reads })]);

  assertEquals(reads.count, 1);
});

Deno.test({
  name: "a message that is refused is decoded twice, and the second decode is thrown away",
  fn: async () => {
    const reads = { count: 0 };

    await dispatchProbes([
      probe({ subject: "q.test_hot_refuses", data: { id: "a" }, deliveryCount: 1, reads }),
    ]);

    assertEquals(
      reads.count,
      1,
      "fail() decodes the payload a second time to hand it to the policy, which only reads it "
        + "on the dead-letter path: on a retry the whole parse is work nobody uses",
    );
  },
});

Deno.test({
  name: "a group that is refused decodes every one of its members twice",
  fn: async () => {
    const reads = { count: 0 };
    const messages = Array.from(
      { length: 50 },
      (_, at) =>
        probe({ subject: "q.test_hot_group", data: { id: `j${at}` }, seq: at + 1, reads }),
    );

    await dispatchProbes(messages);

    assertEquals(
      reads.count,
      50,
      "the group is decoded once to be handed over and once more per member on the way out, "
        + "so a group of fifty that fails pays a hundred parses for fifty payloads",
    );
  },
});

Deno.test("a message on the dead-letter path is decoded once and re-serialised once", async () => {
  const reads = { count: 0 };

  const { published } = await dispatchProbes([
    probe({ subject: "q.test_hot_refuses", data: { id: "a" }, deliveryCount: DEAD_AT, reads }),
  ]);

  assertEquals(published.length, 1);
  assertEquals(
    reads.count,
    1,
    "the decoded message travels from where it was read to where it is republished, so the "
      + "payload is parsed once for the whole path rather than once per step",
  );
});

Deno.test("reading one queue's standing costs two counts and one scan of the delayed set", async () => {
  queueStatus.forget();
  const probeCalls = counting();

  try {
    await queueStatus.one(queueRegistry.get("test:hot:ok")!);

    assertEquals(probeCalls.calls.filter((one) => one.startsWith("count:")).length, 2);
    assertEquals(probeCalls.calls.filter((one) => one === "zscan").length, 1);
  } finally {
    probeCalls.restore();
  }
});

Deno.test("reading every queue's standing scans the delayed set once, not once per queue", async () => {
  queueStatus.forget();
  const probeCalls = counting();

  try {
    const all = await queueStatus.all();

    assertEquals(all.length, queueRegistry.list().length);
    assertEquals(probeCalls.calls.filter((one) => one === "zscan").length, 1);
    assertEquals(
      probeCalls.calls.filter((one) => one.startsWith("count:")).length,
      all.length * 2,
    );
  } finally {
    probeCalls.restore();
  }
});

Deno.test({
  name: "reading the queues one by one scans the whole delayed set once per queue",
  fn: async () => {
    queueStatus.forget();
    const probeCalls = counting();
    const queues = queueRegistry.list().slice(0, 5);

    try {
      for (const queue of queues) await queueStatus.one(queue);

      assertEquals(
        probeCalls.calls.filter((one) => one === "zscan").length,
        1,
        "a dashboard that asks each queue for its standing walks the whole delayed set again "
          + "each time, and the set is shared by every queue of the process: at the scan cap "
          + "that is a hundred round trips per queue for a number all() reads once",
      );
    } finally {
      probeCalls.restore();
    }
  },
});

Deno.test("a push of a hundred items provisions the topology once, not once per item", async () => {
  const published: string[] = [];
  const probeCalls = counting();
  const publishing = installMock(topology, "publish", (subject: string) => {
    published.push(subject);
    return Promise.resolve("1");
  });

  try {
    const queue = new Queue<{ id: number }>(
      { name: "test:hot:many" },
      () => Promise.resolve(),
    );
    await queue.pushMany(Array.from({ length: 100 }, (_, id) => ({ id })));

    assertEquals(published.length, 100);
    assertEquals(probeCalls.calls.filter((one) => one === "ensure").length, 1);
  } finally {
    publishing.restore();
    probeCalls.restore();
  }
});

Deno.test({
  name: "a push of ten thousand items opens ten thousand publications at once",
  fn: async () => {
    let inFlight = 0;
    let peak = 0;
    const probeCalls = counting();
    const publishing = installMock(topology, "publish", async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight--;
      return "1";
    });

    try {
      const queue = new Queue<{ id: number }>(
        { name: "test:hot:flood" },
        () => Promise.resolve(),
      );
      await queue.pushMany(Array.from({ length: 10_000 }, (_, id) => ({ id })));

      assertEquals(
        peak <= 100,
        true,
        `${peak} publications were in flight at once: pushMany hands the whole list to `
          + "Promise.all with no pool, so the producer's memory and the server's inbox both "
          + "grow with the size of the list rather than with a limit the package chose",
      );
    } finally {
      publishing.restore();
      probeCalls.restore();
    }
  },
});

Deno.test("an empty pushMany costs nothing at all", async () => {
  const probeCalls = counting();

  try {
    const queue = new Queue<{ id: number }>(
      { name: "test:hot:empty" },
      () => Promise.resolve(),
    );

    assertEquals(await queue.pushMany([]), []);
    assertEquals(probeCalls.calls, []);
  } finally {
    probeCalls.restore();
  }
});

Deno.test("a pass over a mixed batch asks the registry once per message and no more", async () => {
  const messages = Array.from(
    { length: 200 },
    (_, at) =>
      probe({
        subject: at % 2 === 0 ? "q.test_hot_ok" : "q.test_hot_group",
        data: { id: `j${at}` },
        seq: at + 1,
      }),
  );
  const lookups: string[] = [];
  const held = queueRegistry.bySubject.bind(queueRegistry);
  const mock = installMock(queueRegistry, "bySubject", (subject: string) => {
    lookups.push(subject);
    return held(subject);
  });

  try {
    await dispatchProbes(messages);

    assertEquals(
      lookups.length,
      2,
      "the batch is grouped by subject before anything is looked up, so the registry is asked "
        + "once per subject present and not once per message",
    );
  } finally {
    mock.restore();
  }
});
