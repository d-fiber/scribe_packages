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
import { equals, expect, Scribe } from "@scribe/alchemy/test";
import { installDrivers } from "../../testing/drivers.ts";
import "../../testing/settings.ts";
import { type Kv, kv } from "../../../lib/src/redis/kv.ts";
import { delayedCounts } from "../../../lib/src/queue/delayed/delayed_counts.ts";
import { decodeMember, type DelayedMember, encodeMember } from "../../../lib/src/queue/delayed/delayed_member.ts";
import { promoteDue } from "../../../lib/src/queue/delayed/delayed_promoter.ts";
import { topology } from "../../../lib/src/queue/topology/topology.ts";
import { installMock } from "../../testing/install.ts";

function member(over: Partial<DelayedMember> = {}): string {
  return encodeMember({
    id: "m1",
    queue: "emails",
    subject: "q.emails",
    data: { to: "a@b.c" },
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

installDrivers();

Scribe.test("decodeMember round-trips what encodeMember wrote", () => {
  expect(decodeMember(member())?.queue, equals("emails"));
  expect(decodeMember(member())?.data, equals({ to: "a@b.c" }));
});

Scribe.test("decodeMember rejects a member no promotion could ever use", () => {
  expect(decodeMember("not json at all"), equals(null));
  expect(decodeMember(JSON.stringify({ queue: "emails" })), equals(null));
  expect(decodeMember(JSON.stringify({ id: "m", queue: "e" })), equals(null));
  expect(decodeMember(JSON.stringify({ id: "m", subject: "q.e" })), equals(null));
});

Scribe.test("promoteDue publishes a due job then forgets it", async () => {
  const raw = member();

  const { promoted, removed, published } = await promote({ due: [raw] });

  expect(promoted, equals(1));
  expect(published, equals(["q.emails"]));
  expect(removed, equals([raw]));
});

Scribe.test("promoteDue drops an unreadable member instead of wedging the set", async () => {
  const poison = "{ broken";
  const healthy = member();

  const { promoted, removed, published } = await promote({
    due: [poison, healthy],
  });

  expect(promoted, equals(1));
  expect(published, equals(["q.emails"]));
  expect(removed.includes(poison), equals(true));
  expect(removed.includes(healthy), equals(true));
});

Scribe.test("promoteDue keeps a job it could not publish, for the next pass", async () => {
  const { promoted, removed } = await promote({
    due: [member()],
    publish: () => Promise.reject(new Error("nats down")),
  });

  expect(promoted, equals(0));
  expect(removed, equals([]));
});

Scribe.test("promoteDue reports nothing promoted when the delayed set is unreadable", async () => {
  const mock = installMock(
    kv(),
    "zrangebyscore",
    (() => Promise.reject(new Error("redis down"))) as unknown as Kv[
      "zrangebyscore"
    ],
  );

  try {
    expect(await promoteDue(), equals(0));
  } finally {
    mock.restore();
  }
});

Scribe.test("delayedCounts tallies the backlog by queue", async () => {
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

    expect(counts.counts, equals({ emails: 2, push: 1 }));
    expect(counts.truncated, equals(false));
  } finally {
    mock.restore();
  }
});

Scribe.test("delayedCounts announces itself truncated when the scan fails", async () => {
  const mock = installMock(
    kv(),
    "zscan",
    (() => Promise.reject(new Error("redis down"))) as unknown as Kv["zscan"],
  );

  try {
    const counts = await delayedCounts();

    expect(counts.counts, equals({}));
    expect(counts.truncated, equals(true));
  } finally {
    mock.restore();
  }
});
