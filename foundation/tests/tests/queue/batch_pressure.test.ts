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

import { installDrivers } from "../../testing/drivers.ts";
import { Queue } from "../../../lib/src/queue/queue.ts";
import { processorFor } from "../../../lib/src/queue/runner/processor_for.ts";
import { queueRegistry } from "../../../lib/src/queue/queue_registry.ts";
import { DrainTally } from "../../../lib/src/queue/runner/drain_tally.ts";
import { graceFor, IMMEDIATE_GRACE_MS } from "../../../lib/src/queue/runner/grace_period.ts";
import type { JsMsg } from "@nats-io/jetstream";
import { dispatchProbes, type Probe, probe } from "./probe.ts";
import { assertEquals } from "@std/assert";

installDrivers();

let groups: number[] = [];
let refuseAt = -1;

new Queue<{ id: number }>(
  { name: "test:lot:group", batch: { lingerMs: 40 }, options: { concurrency: 4 } },
  (jobs) => {
    groups.push(jobs.length);
    const poisoned = (jobs as readonly { id: number }[]).some((one) => one.id === refuseAt);
    return poisoned ? Promise.reject(new Error("one member refused")) : Promise.resolve();
  },
);

new Queue<{ id: number }>(
  { name: "test:lot:instant", batch: { lingerMs: 0 } },
  (jobs) => {
    groups.push(jobs.length);
    return Promise.resolve();
  },
);

new Queue<{ id: number }>(
  { name: "test:lot:patient", batch: { lingerMs: 30_000 } },
  () => Promise.resolve(),
);

function lot(count: number, subject = "q.test_lot_group"): Probe[] {
  return Array.from(
    { length: count },
    (_, at) => probe({ subject, data: { id: at }, seq: at + 1 }),
  );
}

Deno.test("a group of ten thousand reaches the body in one call and is acknowledged whole", async () => {
  groups = [];
  refuseAt = -1;
  const messages = lot(10_000);

  const started = performance.now();
  const { result } = await dispatchProbes(messages);
  const spent = performance.now() - started;

  assertEquals(groups, [10_000]);
  assertEquals(result.done, 10_000);
  assertEquals(messages.every((one) => one.acked), true);
  assertEquals(spent < 5_000, true, `handing over ten thousand messages took ${spent}ms`);
});

Deno.test("one refusing member sends every member of the group back, on its own count", async () => {
  groups = [];
  refuseAt = 3;
  const messages = lot(6);
  messages[1].info.deliveryCount = 9;

  const { result } = await dispatchProbes(messages);

  assertEquals(groups, [6]);
  assertEquals(result.retried, 5);
  assertEquals(result.dead, 1, "the member that had used up its deliveries left the group alone");
  assertEquals(messages[1].termed, true);
  assertEquals(messages.filter((one) => one.nakedAfter !== null).length, 5);
});

Deno.test("a group that failed runs again in full, refusing member included", async () => {
  groups = [];
  refuseAt = 3;

  await dispatchProbes(lot(6));
  refuseAt = -1;
  await dispatchProbes(lot(6));

  assertEquals(
    groups,
    [6, 6],
    "the group succeeds or fails whole, so the five members that had nothing wrong with them " +
      "are handed to the body a second time and the body has to stand that",
  );
});

Deno.test("a group of one is still a group", async () => {
  groups = [];
  refuseAt = -1;

  const { result } = await dispatchProbes(lot(1));

  assertEquals(groups, [1]);
  assertEquals(result.done, 1);
});

Deno.test("an empty group never reaches the body at all", async () => {
  groups = [];
  refuseAt = -1;
  const declared = queueRegistry.get("test:lot:group");
  const tally = new DrainTally();

  await processorFor(declared!).process([] as unknown as readonly JsMsg[], tally);

  assertEquals(
    groups,
    [],
    "a body that opens a transaction per group must not pay for a group with no work in it",
  );
  assertEquals(tally.toResult().done, 0);
});

Deno.test("a linger of zero declares a batch queue that never waits for company", () => {
  assertEquals(
    graceFor("q.test_lot_instant"),
    0,
    "zero is kept rather than read as absent, so the fetch closes on its first message and " +
      "the body is called once per message while still acknowledging all or nothing",
  );
  assertEquals(graceFor("q.test_lot_group"), 40);
  assertEquals(graceFor("q.test_lot_patient"), 30_000);
});

Deno.test("the shortest linger in a mixed fetch is the one every subject waits under", () => {
  const present = ["q.test_lot_patient", "q.test_lot_group", "q.test_dispatch_never"];

  assertEquals(
    Math.min(...present.map(graceFor)),
    IMMEDIATE_GRACE_MS,
    "a queue that groups must never hold back one that does not, so the batch closes on the " +
      "shortest window present and a patient queue gets no grouping at all when it travels " +
      "beside an impatient one",
  );
});

Deno.test("a mixed fetch of two groups is handed over in parallel, not one after the other", async () => {
  groups = [];
  refuseAt = -1;
  const order: string[] = [];

  new Queue<{ id: number }>({ name: "test:lot:slow" }, async () => {
    order.push("slow-in");
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push("slow-out");
  });
  new Queue<{ id: number }>({ name: "test:lot:quick" }, () => {
    order.push("quick");
    return Promise.resolve();
  });

  await dispatchProbes([
    probe({ subject: "q.test_lot_slow", data: { id: 1 }, seq: 1 }),
    probe({ subject: "q.test_lot_quick", data: { id: 2 }, seq: 2 }),
  ]);

  assertEquals(order, ["slow-in", "quick", "slow-out"]);
});
