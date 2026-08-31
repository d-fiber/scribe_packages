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
import { Queue } from "../../../lib/src/queue/queue.ts";
import { processorFor } from "../../../lib/src/queue/runner/processor_for.ts";
import { queueRegistry } from "../../../lib/src/queue/queue_registry.ts";
import { DrainTally } from "../../../lib/src/queue/runner/drain_tally.ts";
import { graceFor, IMMEDIATE_GRACE_MS } from "../../../lib/src/queue/runner/grace_period.ts";
import type { JsMsg } from "@nats-io/jetstream";
import { dispatchProbes, type Probe, probe } from "./probe.ts";
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

Scribe.test("a group of ten thousand reaches the body in one call and is acknowledged whole", async () => {
  groups = [];
  refuseAt = -1;
  const messages = lot(10_000);

  const { result } = await dispatchProbes(messages);

  expect(groups, equals([10_000]));
  expect(result.done, equals(10_000));
  expect(messages.every((one) => one.acked), equals(true));
});

Scribe.test("one refusing member sends every member of the group back, on its own count", async () => {
  groups = [];
  refuseAt = 3;
  const messages = lot(6);
  messages[1].info.deliveryCount = 9;

  const { result } = await dispatchProbes(messages);

  expect(groups, equals([6]));
  expect(result.retried, equals(5));
  expect(result.dead, equals(1), "the member that had used up its deliveries left the group alone");
  expect(messages[1].termed, equals(true));
  expect(messages.filter((one) => one.nakedAfter !== null).length, equals(5));
});

Scribe.test("a group that failed runs again in full, refusing member included", async () => {
  groups = [];
  refuseAt = 3;

  await dispatchProbes(lot(6));
  refuseAt = -1;
  await dispatchProbes(lot(6));

  expect(
    groups,
    equals([6, 6]),
    "the group succeeds or fails whole, so the five members that had nothing wrong with them " +
      "are handed to the body a second time and the body has to stand that",
  );
});

Scribe.test("a group of one is still a group", async () => {
  groups = [];
  refuseAt = -1;

  const { result } = await dispatchProbes(lot(1));

  expect(groups, equals([1]));
  expect(result.done, equals(1));
});

Scribe.test("an empty group never reaches the body at all", async () => {
  groups = [];
  refuseAt = -1;
  const declared = queueRegistry.get("test:lot:group");
  const tally = new DrainTally();

  await processorFor(declared!).process([] as unknown as readonly JsMsg[], tally);

  expect(groups, equals([]), "a body that opens a transaction per group must not pay for a group with no work in it");
  expect(tally.toResult().done, equals(0));
});

Scribe.test("a linger of zero declares a batch queue that never waits for company", () => {
  expect(
    graceFor("q.test_lot_instant"),
    equals(0),
    "zero is kept rather than read as absent, so the fetch closes on its first message and " +
      "the body is called once per message while still acknowledging all or nothing",
  );
  expect(graceFor("q.test_lot_group"), equals(40));
  expect(graceFor("q.test_lot_patient"), equals(30_000));
});

Scribe.test("the shortest linger in a mixed fetch is the one every subject waits under", () => {
  const present = ["q.test_lot_patient", "q.test_lot_group", "q.test_dispatch_never"];

  expect(
    Math.min(...present.map(graceFor)),
    equals(IMMEDIATE_GRACE_MS),
    "a queue that groups must never hold back one that does not, so the batch closes on the " +
      "shortest window present and a patient queue gets no grouping at all when it travels " +
      "beside an impatient one",
  );
});

Scribe.test("a mixed fetch of two groups is handed over in parallel, not one after the other", async () => {
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

  expect(order, equals(["slow-in", "quick", "slow-out"]));
});
