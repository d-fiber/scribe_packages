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

import type {
  DistributedLock,
  LockOutcome,
} from "@scribe/foundation/src/valkery/lock/distributed_lock.ts";
import {
  type ValkerySlot,
  SingleFlight,
} from "@scribe/foundation/src/valkery/single_flight.ts";
import { assert, assertEquals } from "@std/assert";

class ScriptedLock {
  released: string[] = [];

  constructor(private readonly outcomes: LockOutcome[]) {}

  acquire(): Promise<LockOutcome> {
    return Promise.resolve(
      this.outcomes.shift() ?? { state: "held" as const },
    );
  }

  release(lockKey: string): Promise<void> {
    this.released.push(lockKey);
    return Promise.resolve();
  }
}

function slotOf<T>(initial: T | null): ValkerySlot<T> & { written: T[] } {
  let value = initial;
  const written: T[] = [];
  return {
    written,
    read: () => Promise.resolve(value),
    write: (next: T) => {
      value = next;
      written.push(next);
      return Promise.resolve();
    },
  };
}

function flight(lock: ScriptedLock, gaveUp: string[]) {
  return new SingleFlight(
    lock as unknown as DistributedLock,
    (id) => gaveUp.push(id),
  );
}

Deno.test("SingleFlight computes, writes and releases when it wins the lock", async () => {
  const lock = new ScriptedLock([{ state: "acquired", token: "t1" }]);
  const slot = slotOf<string>(null);
  const gaveUp: string[] = [];

  const value = await flight(lock, gaveUp).run(
    "id",
    "lock:id",
    slot,
    () => Promise.resolve("computed"),
  );

  assertEquals(value, "computed");
  assertEquals(slot.written, ["computed"]);
  assertEquals(lock.released, ["lock:id"]);
  assertEquals(gaveUp, []);
});

Deno.test("SingleFlight releases the lock even if the computation throws", async () => {
  const lock = new ScriptedLock([{ state: "acquired", token: "t1" }]);
  const gaveUp: string[] = [];

  await flight(lock, gaveUp)
    .run("id", "lock:id", slotOf<string>(null), () =>
      Promise.reject(new Error("boom")))
    .catch(() => {});

  assertEquals(lock.released, ["lock:id"]);
});

Deno.test("SingleFlight waits for the winner instead of computing twice", async () => {
  const lock = new ScriptedLock([{ state: "held" }]);
  const gaveUp: string[] = [];
  let computed = 0;

  const slot = slotOf<string>(null);
  const original = slot.read;
  let polls = 0;
  slot.read = () => {
    polls++;
    return polls > 1 ? Promise.resolve("from winner") : original();
  };

  const value = await flight(lock, gaveUp).run("id", "lock:id", slot, () => {
    computed++;
    return Promise.resolve("mine");
  });

  assertEquals(value, "from winner");
  assertEquals(computed, 0);
  assertEquals(gaveUp, []);
});

Deno.test("SingleFlight computes without the lock when acquiring errors", async () => {
  const lock = new ScriptedLock([{ state: "error" }]);
  const gaveUp: string[] = [];

  const value = await flight(lock, gaveUp).run(
    "id",
    "lock:id",
    slotOf<string>(null),
    () => Promise.resolve("fallback"),
  );

  assertEquals(value, "fallback");
  assertEquals(gaveUp, ["id"]);
  assert(lock.released.length === 0);
});
