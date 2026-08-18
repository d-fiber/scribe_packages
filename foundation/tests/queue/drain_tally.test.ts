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

import { DrainTally } from "@scribe/foundation/src/queue/runner/drain_tally.ts";
import {
  DeadlineExceededError,
  withDeadline,
} from "@scribe/core/runtime/support/async/deadline.ts";
import { assertEquals, assertInstanceOf, assertRejects } from "@std/assert";

Deno.test("DrainTally starts at zero on every counter", () => {
  assertEquals(new DrainTally().toResult(), {
    done: 0,
    retried: 0,
    dead: 0,
    promoted: 0,
  });
});

Deno.test("DrainTally accumulates each outcome independently", () => {
  const tally = new DrainTally();

  tally.record("done");
  tally.record("done", 4);
  tally.record("retried");
  tally.record("dead", 2);
  tally.promote(7);

  assertEquals(tally.toResult(), {
    done: 5,
    retried: 1,
    dead: 2,
    promoted: 7,
  });
});

Deno.test("DrainTally hands out a snapshot, not its own state", () => {
  const tally = new DrainTally();
  tally.record("done");

  const first = tally.toResult();
  tally.record("done");

  assertEquals(first.done, 1);
  assertEquals(tally.toResult().done, 2);
});

Deno.test("withDeadline resolves when the handler beats the clock", async () => {
  assertEquals(await withDeadline("fast", 50, Promise.resolve("ok")), "ok");
});

Deno.test("withDeadline rejects with DeadlineExceededError past the deadline", async () => {
  let release: (value: string) => void = () => {};
  const pending = new Promise<string>((resolve) => {
    release = resolve;
  });

  const error = await assertRejects(() => withDeadline("slow", 5, pending));
  assertInstanceOf(error, DeadlineExceededError);

  release("late");
  await pending;
});

Deno.test("withDeadline propagates the handler's own failure untouched", async () => {
  const boom = new TypeError("handler exploded");

  const error = await assertRejects(() =>
    withDeadline("broken", 50, Promise.reject(boom))
  );

  assertEquals(error, boom);
});
