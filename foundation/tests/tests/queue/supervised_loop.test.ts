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
import { FakeTime } from "@std/testing/time";
import { installDrivers } from "../../testing/drivers.ts";
import { SupervisedLoop } from "../../../lib/src/queue/runner/supervised_loop.ts";

installDrivers();

Scribe.test("prepare runs once, before the first pass", async () => {
  const calls: string[] = [];
  let running = true;
  let resolveDone: () => void;
  const done = new Promise<void>((resolve) => resolveDone = resolve);

  new SupervisedLoop(
    "test",
    () => {
      calls.push("pass");
      running = false;
      resolveDone();
      return Promise.resolve();
    },
    () => running,
    () => {
      calls.push("prepare");
      return Promise.resolve();
    },
  ).start();

  await done;

  expect(calls, equals(["prepare", "pass"]));
});

Scribe.test("the loop repeats the pass while isRunning says so, and stops the instant it does not", async () => {
  let calls = 0;
  let running = true;
  let resolveDone: () => void;
  const done = new Promise<void>((resolve) => resolveDone = resolve);

  new SupervisedLoop(
    "test",
    () => {
      calls++;
      if (calls === 3) {
        running = false;
        resolveDone();
      }
      return Promise.resolve();
    },
    () => running,
  ).start();

  await done;

  expect(calls, equals(3), "the third pass is the one that flipped isRunning to false, and no fourth one followed");
});

Scribe.test("a pass that throws is retried after a backoff, without ending the loop", async () => {
  const time = new FakeTime();
  try {
    let calls = 0;
    let running = true;
    let resolveDone: () => void;
    const done = new Promise<void>((resolve) => resolveDone = resolve);

    new SupervisedLoop(
      "test",
      () => {
        calls++;
        if (calls === 1) return Promise.reject(new Error("boom"));
        running = false;
        resolveDone();
        return Promise.resolve();
      },
      () => running,
    ).start();

    await time.tickAsync(1_000);
    await time.runMicrotasks();
    await done;

    expect(calls, equals(2), "the pass that threw did not stop the loop, and the retry after the backoff succeeded");
  } finally {
    time.restore();
  }
});

Scribe.test("isRunning already false when start() runs means the pass never fires", async () => {
  let calls = 0;

  new SupervisedLoop("test", () => {
    calls++;
    return Promise.resolve();
  }, () => false).start();

  await Promise.resolve();
  await Promise.resolve();

  expect(calls, equals(0), "a loop told to stop before its first turn never runs a pass at all");
});
