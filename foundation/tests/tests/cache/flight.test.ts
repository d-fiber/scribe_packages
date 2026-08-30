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
import { equals, expect, expectLater, isNotNull, isTrue, Scribe, throwsA } from "@scribe/alchemy/test";
import { Duration } from "@scribe/alchemy";
import { installDrivers } from "../../testing/drivers.ts";
import type { DistributedLock, LockOutcome } from "../../../lib/src/cache/lock/distributed_lock.ts";
import { DistributedFlight } from "../../../lib/src/cache/flight/distributed_flight.ts";
import { LocalFlight } from "../../../lib/src/cache/flight/local_flight.ts";

class ScriptedLock {
  released: string[] = [];
  acquired = 0;

  constructor(private readonly outcomes: LockOutcome[]) {}

  acquire(): Promise<LockOutcome> {
    this.acquired++;
    return Promise.resolve(this.outcomes.shift() ?? { state: "held" as const });
  }

  release(lockKey: string): Promise<void> {
    this.released.push(lockKey);
    return Promise.resolve();
  }
}

function flight(lock: ScriptedLock, gaveUp: string[]): DistributedFlight {
  return new DistributedFlight(
    lock as unknown as DistributedLock,
    (id) => gaveUp.push(id),
  );
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

installDrivers();

Scribe.test("LocalFlight runs one computation for concurrent callers of a key", async () => {
  const local = new LocalFlight();
  const gate = deferred<string>();
  let computed = 0;

  const compute = () => {
    computed++;
    return gate.promise;
  };

  const all = Promise.all([
    local.run("k", compute),
    local.run("k", compute),
    local.run("k", compute),
  ]);
  expect(local.size, equals(1), "three callers should share one flight");

  gate.resolve("value");
  expect(await all, equals(["value", "value", "value"]));
  expect(computed, equals(1));
});

Scribe.test("LocalFlight keeps distinct keys apart", async () => {
  const local = new LocalFlight();
  const seen: string[] = [];

  await Promise.all([
    local.run("a", () => {
      seen.push("a");
      return Promise.resolve(1);
    }),
    local.run("b", () => {
      seen.push("b");
      return Promise.resolve(2);
    }),
  ]);

  expect(seen.sort(), equals(["a", "b"]));
});

Scribe.test("LocalFlight forgets a settled key so the next caller computes again", async () => {
  const local = new LocalFlight();
  let computed = 0;

  await local.run("k", () => Promise.resolve(++computed));
  expect(local.size, equals(0), "a settled flight must not be retained");

  await local.run("k", () => Promise.resolve(++computed));
  expect(computed, equals(2));
});

Scribe.test("LocalFlight shares a rejection, then lets the next caller retry", async () => {
  const local = new LocalFlight();
  let attempts = 0;

  const failing = () => {
    attempts++;
    return Promise.reject(new Error("boom"));
  };

  const first = local.run("k", failing);
  const joined = local.run("k", failing);

  await expectLater(() => first, throwsA(isNotNull));
  await expectLater(() => joined, throwsA(isNotNull));
  expect(attempts, equals(1), "the joiner should share the failure, not repeat it");
  expect(local.size, equals(0), "a rejected flight must not be retained");

  expect(await local.run("k", () => Promise.resolve("ok")), equals("ok"));
});

Scribe.test("DistributedFlight computes and releases when it wins the lock", async () => {
  const lock = new ScriptedLock([{ state: "acquired", token: "t1" }]);
  const gaveUp: string[] = [];

  const value = await flight(lock, gaveUp).run(
    "id",
    "lock:id",
    () => Promise.resolve(null),
    () => Promise.resolve("computed"),
    Duration.seconds(8),
  );

  expect(value, equals("computed"));
  expect(lock.released, equals(["lock:id"]));
  expect(gaveUp, equals([]));
});

Scribe.test("DistributedFlight releases the lock even if the computation throws", async () => {
  const lock = new ScriptedLock([{ state: "acquired", token: "t1" }]);
  const gaveUp: string[] = [];

  await flight(lock, gaveUp)
    .run(
      "id",
      "lock:id",
      () => Promise.resolve(null),
      () => Promise.reject(new Error("boom")),
      Duration.seconds(8),
    )
    .catch(() => {});

  expect(lock.released, equals(["lock:id"]));
});

Scribe.test("DistributedFlight reads back the winner's value instead of computing twice", async () => {
  const lock = new ScriptedLock([{ state: "held" }]);
  const gaveUp: string[] = [];
  let computed = 0;
  let reads = 0;

  const value = await flight(lock, gaveUp).run(
    "id",
    "lock:id",
    () => Promise.resolve(++reads > 1 ? "from winner" : null),
    () => {
      computed++;
      return Promise.resolve("mine");
    },
    Duration.seconds(8),
  );

  expect(value, equals("from winner"));
  expect(computed, equals(0));
  expect(gaveUp, equals([]));
});

Scribe.test("DistributedFlight computes without the lock when acquiring errors", async () => {
  const lock = new ScriptedLock([{ state: "error" }]);
  const gaveUp: string[] = [];

  const value = await flight(lock, gaveUp).run(
    "id",
    "lock:id",
    () => Promise.resolve(null),
    () => Promise.resolve("fallback"),
    Duration.seconds(8),
  );

  expect(value, equals("fallback"));
  expect(gaveUp, equals(["id"]));
  expect(lock.released.length === 0, isTrue);
});

Scribe.test("attempt() runs the refresh when it wins, and releases", async () => {
  const lock = new ScriptedLock([{ state: "acquired", token: "t1" }]);

  const value = await flight(lock, []).attempt(
    "lock:id",
    () => Promise.resolve("refreshed"),
  );

  expect(value, equals("refreshed"));
  expect(lock.released, equals(["lock:id"]));
});

Scribe.test("attempt() gives up at once when another replica holds the lock", async () => {
  const lock = new ScriptedLock([{ state: "held" }]);
  let computed = 0;

  const value = await flight(lock, []).attempt("lock:id", () => {
    computed++;
    return Promise.resolve("refreshed");
  });

  expect(value, equals(null), "a refresh must never wait, the old value is still good");
  expect(computed, equals(0));
  expect(lock.acquired, equals(1), "it must not poll");
});

Scribe.test("DistributedFlight stops waiting when the caller's budget runs out, not when the lease does", async () => {
  const lock = new ScriptedLock([]);
  const gaveUp: string[] = [];
  const value = await flight(lock, gaveUp).run(
    "id",
    "lock:id",
    () => Promise.resolve(null),
    () => Promise.resolve("computed anyway"),
    Duration.milliseconds(250),
  );

  expect(value, equals("computed anyway"));
  expect(gaveUp, equals(["id"]));
  expect(
    lock.acquired >= 1 && lock.acquired < 12,
    isTrue,
    `the loser made ${lock.acquired} attempts: waiting out the lease instead of the budget is hundreds`,
  );
});
