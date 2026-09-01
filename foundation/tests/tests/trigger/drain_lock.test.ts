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
import "../../testing/settings.ts";

import { Duration } from "@scribe/alchemy";
import { installDrivers } from "../../testing/drivers.ts";
import { recordLog } from "../../testing/logger.ts";
import { DrainLock } from "../../../lib/src/trigger/drain_lock.ts";
import { kv } from "../../../lib/src/redis/kv.ts";

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

Scribe.test("claim() answers yes only on the exact reply the store promises", async () => {
  const lock = new DrainLock();

  for (const [reply, expected] of [["OK", true], [null, false], ["ok", false], [1, false]] as const) {
    const shadow = answering(reply);
    try {
      expect(await lock.claim(Duration.seconds(10)), equals(expected), `the store answered ${String(reply)}`);
    } finally {
      shadow.restore();
    }
  }
});

Scribe.test("claim() carries the pass length and the key as an expiring, exclusive set", async () => {
  const lock = new DrainLock();
  const calls: unknown[][] = [];
  const target = kv() as unknown as Record<string, unknown>;
  const had = Object.prototype.hasOwnProperty.call(target, "set");
  const original = target.set;

  target.set = (...args: unknown[]) => {
    calls.push(args);
    return Promise.resolve("OK");
  };

  try {
    await lock.claim(Duration.seconds(10));
    expect(calls.length, equals(1));
    expect(calls[0], equals(["trigger:drain", "1", "PX", 10_000, "NX"]));
  } finally {
    if (had) target.set = original;
    else delete target.set;
  }
});

Scribe.test("claim() answers no and says so when the store is unreachable", async () => {
  const lock = new DrainLock();
  const target = kv() as unknown as Record<string, unknown>;
  const had = Object.prototype.hasOwnProperty.call(target, "set");
  const original = target.set;
  target.set = () => Promise.reject(new Error("redis down"));
  const logs = recordLog();

  try {
    expect(await lock.claim(Duration.seconds(10)), equals(false));
    expect(logs.actions.includes("trigger-runner.lock_unavailable"), equals(true));
  } finally {
    if (had) target.set = original;
    else delete target.set;
  }
});

Scribe.test("a second claim on the same pass fails while the first is still held", async () => {
  const lock = new DrainLock();
  const held = new Set<string>();
  const target = kv() as unknown as Record<string, unknown>;
  const had = Object.prototype.hasOwnProperty.call(target, "set");
  const original = target.set;

  target.set = (key: string) => Promise.resolve(held.has(key) ? null : (held.add(key), "OK"));

  try {
    expect(await lock.claim(Duration.seconds(10)), equals(true));
    expect(await new DrainLock().claim(Duration.seconds(10)), equals(false));
  } finally {
    if (had) target.set = original;
    else delete target.set;
  }
});

Scribe.test("a claim taken after the pass expired succeeds again", async () => {
  const lock = new DrainLock();
  let held = false;
  const target = kv() as unknown as Record<string, unknown>;
  const had = Object.prototype.hasOwnProperty.call(target, "set");
  const original = target.set;

  target.set = () => Promise.resolve(held ? null : "OK");

  try {
    expect(await lock.claim(Duration.seconds(10)), equals(true));
    held = true;
    expect(await new DrainLock().claim(Duration.seconds(10)), equals(false), "the first pass is still held");
    held = false;
    expect(await new DrainLock().claim(Duration.seconds(10)), equals(true), "the previous pass has expired");
  } finally {
    if (had) target.set = original;
    else delete target.set;
  }
});
