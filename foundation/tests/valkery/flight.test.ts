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

import type { DistributedLock, LockOutcome } from "@scribe/foundation/src/valkery/lock/distributed_lock.ts";
import { DistributedFlight } from "@scribe/foundation/src/valkery/flight/distributed.ts";
import { LocalFlight } from "@scribe/foundation/src/valkery/flight/local.ts";
import { assert, assertEquals, assertRejects } from "@std/assert";

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

Deno.test("LocalFlight runs one computation for concurrent callers of a key", async () => {
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
  assertEquals(local.size, 1, "three callers should share one flight");

  gate.resolve("value");
  assertEquals(await all, ["value", "value", "value"]);
  assertEquals(computed, 1);
});

Deno.test("LocalFlight keeps distinct keys apart", async () => {
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

  assertEquals(seen.sort(), ["a", "b"]);
});

Deno.test("LocalFlight forgets a settled key so the next caller computes again", async () => {
  const local = new LocalFlight();
  let computed = 0;

  await local.run("k", () => Promise.resolve(++computed));
  assertEquals(local.size, 0, "a settled flight must not be retained");

  await local.run("k", () => Promise.resolve(++computed));
  assertEquals(computed, 2);
});

Deno.test("LocalFlight shares a rejection, then lets the next caller retry", async () => {
  const local = new LocalFlight();
  let attempts = 0;

  const failing = () => {
    attempts++;
    return Promise.reject(new Error("boom"));
  };

  const first = local.run("k", failing);
  const joined = local.run("k", failing);

  await assertRejects(() => first);
  await assertRejects(() => joined);
  assertEquals(attempts, 1, "the joiner should share the failure, not repeat it");
  assertEquals(local.size, 0, "a rejected flight must not be retained");

  assertEquals(await local.run("k", () => Promise.resolve("ok")), "ok");
});

Deno.test("DistributedFlight computes and releases when it wins the lock", async () => {
  const lock = new ScriptedLock([{ state: "acquired", token: "t1" }]);
  const gaveUp: string[] = [];

  const value = await flight(lock, gaveUp).run(
    "id",
    "lock:id",
    () => Promise.resolve(null),
    () => Promise.resolve("computed"),
  );

  assertEquals(value, "computed");
  assertEquals(lock.released, ["lock:id"]);
  assertEquals(gaveUp, []);
});

Deno.test("DistributedFlight releases the lock even if the computation throws", async () => {
  const lock = new ScriptedLock([{ state: "acquired", token: "t1" }]);
  const gaveUp: string[] = [];

  await flight(lock, gaveUp)
    .run(
      "id",
      "lock:id",
      () => Promise.resolve(null),
      () => Promise.reject(new Error("boom")),
    )
    .catch(() => {});

  assertEquals(lock.released, ["lock:id"]);
});

Deno.test("DistributedFlight reads back the winner's value instead of computing twice", async () => {
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
  );

  assertEquals(value, "from winner");
  assertEquals(computed, 0);
  assertEquals(gaveUp, []);
});

Deno.test("DistributedFlight computes without the lock when acquiring errors", async () => {
  const lock = new ScriptedLock([{ state: "error" }]);
  const gaveUp: string[] = [];

  const value = await flight(lock, gaveUp).run(
    "id",
    "lock:id",
    () => Promise.resolve(null),
    () => Promise.resolve("fallback"),
  );

  assertEquals(value, "fallback");
  assertEquals(gaveUp, ["id"]);
  assert(lock.released.length === 0);
});

Deno.test("attempt() runs the refresh when it wins, and releases", async () => {
  const lock = new ScriptedLock([{ state: "acquired", token: "t1" }]);

  const value = await flight(lock, []).attempt(
    "lock:id",
    () => Promise.resolve("refreshed"),
  );

  assertEquals(value, "refreshed");
  assertEquals(lock.released, ["lock:id"]);
});

Deno.test("attempt() gives up at once when another replica holds the lock", async () => {
  const lock = new ScriptedLock([{ state: "held" }]);
  let computed = 0;

  const value = await flight(lock, []).attempt("lock:id", () => {
    computed++;
    return Promise.resolve("refreshed");
  });

  assertEquals(value, null, "a refresh must never wait, the old value is still good");
  assertEquals(computed, 0);
  assertEquals(lock.acquired, 1, "it must not poll");
});
