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
import { kv, type Kv } from "@scribe/core/runtime/redis/mod.ts";
import { delayedCounts } from "@scribe/foundation/src/queue/core/delayed/counts.ts";
import {
  decodeMember,
  type DelayedMember,
  encodeMember,
} from "@scribe/foundation/src/queue/core/delayed/member.ts";
import { promoteDue } from "@scribe/foundation/src/queue/core/delayed/promoter.ts";
import { topology } from "@scribe/foundation/src/queue/core/topology/topology.ts";
import { installMock } from "@scribe/core/testing/install.ts";
import { assertEquals } from "@std/assert";

function member(over: Partial<DelayedMember> = {}): string {
  return encodeMember({
    id: "m1",
    queue: "emails",
    subject: "q.emails",
    data: { to: "a@b.c" },
    attempts: 0,
    ...over,
  });
}

interface Promotion {
  readonly due: string[];
  publish?: () => Promise<string>;
}

async function promote(scenario: Promotion) {
  const removed: string[] = [];
  const published: string[] = [];

  const mocks = [
    installMock(
      kv(),
      "zrangebyscore",
      (() => Promise.resolve(scenario.due)) as unknown as Kv["zrangebyscore"],
    ),
    installMock(
      kv(),
      "zrem",
      ((_key: string, raw: string) => {
        removed.push(raw);
        return Promise.resolve(1);
      }) as unknown as Kv["zrem"],
    ),
    installMock(topology, "publish", (subject: string) => {
      published.push(subject);
      return scenario.publish?.() ?? Promise.resolve("1");
    }),
  ];

  try {
    return { promoted: await promoteDue(), removed, published };
  } finally {
    for (const mock of mocks) mock.restore();
  }
}

Deno.test("decodeMember round-trips what encodeMember wrote", () => {
  assertEquals(decodeMember(member())?.queue, "emails");
  assertEquals(decodeMember(member({ attempts: 3 }))?.attempts, 3);
});

Deno.test("decodeMember rejects a member no promotion could ever use", () => {
  assertEquals(decodeMember("not json at all"), null);
  assertEquals(decodeMember(JSON.stringify({ queue: "emails" })), null);
  assertEquals(
    decodeMember(JSON.stringify({ id: "m", queue: "e", subject: "q.e" })),
    null,
  );
  assertEquals(
    decodeMember(
      JSON.stringify({ id: "m", queue: "e", subject: "q.e", attempts: "many" }),
    ),
    null,
  );
});

Deno.test("promoteDue publishes a due job then forgets it", async () => {
  const raw = member();

  const { promoted, removed, published } = await promote({ due: [raw] });

  assertEquals(promoted, 1);
  assertEquals(published, ["q.emails"]);
  assertEquals(removed, [raw]);
});

Deno.test("promoteDue drops an unreadable member instead of wedging the set", async () => {
  const poison = "{ broken";
  const healthy = member();

  const { promoted, removed, published } = await promote({
    due: [poison, healthy],
  });

  assertEquals(promoted, 1);
  assertEquals(published, ["q.emails"]);
  assertEquals(removed.includes(poison), true);
  assertEquals(removed.includes(healthy), true);
});

Deno.test("promoteDue keeps a job it could not publish, for the next pass", async () => {
  const { promoted, removed } = await promote({
    due: [member()],
    publish: () => Promise.reject(new Error("nats down")),
  });

  assertEquals(promoted, 0);
  assertEquals(removed, []);
});

Deno.test("promoteDue reports nothing promoted when the delayed set is unreadable", async () => {
  const mock = installMock(
    kv(),
    "zrangebyscore",
    (() => Promise.reject(new Error("redis down"))) as unknown as Kv[
      "zrangebyscore"
    ],
  );

  try {
    assertEquals(await promoteDue(), 0);
  } finally {
    mock.restore();
  }
});

Deno.test("delayedCounts tallies the backlog by queue", async () => {
  const mock = installMock(
    kv(),
    "zscan",
    (() =>
      Promise.resolve([
        "0",
        [member(), "1", member({ queue: "push" }), "2", member(), "3"],
      ] as [string, string[]])) as unknown as Kv["zscan"],
  );

  try {
    const counts = await delayedCounts();

    assertEquals(counts.counts, { emails: 2, push: 1 });
    assertEquals(counts.truncated, false);
  } finally {
    mock.restore();
  }
});

Deno.test("delayedCounts announces itself truncated when the scan fails", async () => {
  const mock = installMock(
    kv(),
    "zscan",
    (() => Promise.reject(new Error("redis down"))) as unknown as Kv["zscan"],
  );

  try {
    const counts = await delayedCounts();

    assertEquals(counts.counts, {});
    assertEquals(counts.truncated, true);
  } finally {
    mock.restore();
  }
});
