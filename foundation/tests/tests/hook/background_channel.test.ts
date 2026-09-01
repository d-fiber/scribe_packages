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
import "@scribe/runtime/scholium/runner.ts";
import { equals, expect, Scribe } from "@scribe/alchemy/test";
import { installDrivers } from "../../testing/drivers.ts";
import { installQueueMock } from "../../testing/queue.ts";
import { BackgroundChannel } from "../../../lib/src/hook/background_channel.ts";

installDrivers();

Scribe.test("a channel nobody subscribed to has no queue armed", () => {
  const channel = new BackgroundChannel<string>("test.channel.idle");

  expect(channel.armed, equals(false));
  expect(channel.size, equals(0));
});

Scribe.test("the queue is armed on the first subscriber, and stays armed after", () => {
  const channel = new BackgroundChannel<string>("test.channel.arms-once");

  channel.add(() => {});
  expect(channel.armed, equals(true));

  channel.add(() => {});
  expect(channel.armed, equals(true));
  expect(channel.size, equals(2));
});

Scribe.test("enqueue on a channel with no subscriber does nothing and never throws", async () => {
  const channel = new BackgroundChannel<string>("test.channel.no-subscriber");

  await channel.enqueue("payload");

  expect(channel.armed, equals(false));
});

Scribe.test("every subscriber on a channel runs, in the order it subscribed, for one push", async () => {
  const mock = installQueueMock();
  try {
    const channel = new BackgroundChannel<{ id: string }>("test.channel.order");
    const seen: string[] = [];

    channel.add((payload) => {
      seen.push(`first:${payload.id}`);
    });
    channel.add((payload) => {
      seen.push(`second:${payload.id}`);
    });

    await channel.enqueue({ id: "x" });

    expect(seen, equals(["first:x", "second:x"]));
  } finally {
    mock.restore();
  }
});

Scribe.test("a subscriber that throws stops the ones after it from running for that push", async () => {
  const mock = installQueueMock();
  try {
    const channel = new BackgroundChannel<{ id: string }>("test.channel.throws");
    let secondRan = false;

    channel.add(() => {
      throw new Error("background handler exploded");
    });
    channel.add(() => {
      secondRan = true;
    });

    await channel.enqueue({ id: "x" });

    expect(secondRan, equals(false), "the queue body awaits handlers in order, and a throw stops the loop");
  } finally {
    mock.restore();
  }
});

Scribe.test("two pushes each run every subscriber once", async () => {
  const mock = installQueueMock();
  try {
    const channel = new BackgroundChannel<{ id: string }>("test.channel.twice");
    let calls = 0;

    channel.add(() => {
      calls++;
    });

    await channel.enqueue({ id: "a" });
    await channel.enqueue({ id: "b" });

    expect(calls, equals(2));
  } finally {
    mock.restore();
  }
});
