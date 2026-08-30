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
import { dispatchProbes, probe, unanswered } from "./probe.ts";
installDrivers();

const CEILING = 2;

new Queue<{ id: string }>(
  { name: "test:policy:serial", options: { maxRetries: CEILING, concurrency: 1 } },
  () => Promise.reject(new Error("refused")),
);

new Queue<{ id: string }>(
  {
    name: "test:policy:group",
    batch: { lingerMs: 5 },
    options: { maxRetries: CEILING, concurrency: 1 },
  },
  () => Promise.reject(new Error("refused")),
);

const down = () => Promise.reject(new Error("nats is down"));

function spent(subject: string, seq: number) {
  return probe({ subject, data: { id: `j${seq}` }, deliveryCount: CEILING, seq });
}

Scribe.test("a dead letter that cannot be written leaves every message behind it unanswered", async () => {
  const messages = [
    spent("q.test_policy_serial", 1),
    spent("q.test_policy_serial", 2),
    spent("q.test_policy_serial", 3),
  ];

  const { rejected } = await dispatchProbes(messages, { publish: down });

  expect(
    rejected,
    equals(null),
    "the failure path has no failure path: the rejected publish escapes fail(), runPooled " +
      "and the dispatcher, and the whole pass is thrown away with its tally",
  );
  expect(
    messages.filter(unanswered).length,
    equals(0),
    "the messages the pool never reached hold their consumer slot until ack_wait expires, " +
      "which on the default settings is ten minutes of doing nothing",
  );
});

Scribe.test("a message whose dead letter failed is refused rather than left silent", async () => {
  const message = spent("q.test_policy_serial", 1);

  await dispatchProbes([message], { publish: down });

  expect(
    message.nakedAfter !== null || message.termed,
    equals(true),
    "when the dead letter cannot be written the message must still be answered, and coming " +
      "back later is the only answer that loses nothing",
  );
});

Scribe.test("one failed dead letter in a group takes the rest of the group down with it", async () => {
  const messages = [
    spent("q.test_policy_group", 1),
    spent("q.test_policy_group", 2),
    spent("q.test_policy_group", 3),
  ];

  const { rejected } = await dispatchProbes(messages, { publish: down });

  expect(rejected, equals(null));
  expect(messages.filter(unanswered).length, equals(0));
});

Scribe.test("a group that cannot be dead-lettered loses the outcomes of the subjects beside it", async () => {
  let handled = 0;
  new Queue<{ id: string }>({ name: "test:policy:neighbour" }, () => {
    handled++;
    return Promise.resolve();
  });

  const { result, rejected } = await dispatchProbes(
    [
      spent("q.test_policy_serial", 1),
      probe({ subject: "q.test_policy_neighbour", data: { id: "n" }, seq: 2 }),
    ],
    { publish: down },
  );

  expect(handled, equals(1));
  expect(rejected, equals(null));
  expect(
    result.done,
    equals(1),
    "the neighbouring group ran and acknowledged its message, but the exception raised by " +
      "the other group threw the whole tally away, so a drain reports nothing done",
  );
});

Scribe.test("an acknowledgement that fails half way through a group refuses the members it already acknowledged", async () => {
  let called = 0;
  new Queue<{ id: string }>(
    { name: "test:policy:acked", batch: { lingerMs: 5 }, options: { maxRetries: CEILING } },
    () => {
      called++;
      return Promise.resolve();
    },
  );

  const first = probe({ subject: "q.test_policy_acked", data: { id: "a" }, seq: 1 });
  const second = probe({ subject: "q.test_policy_acked", data: { id: "b" }, seq: 2 });
  const third = probe({
    subject: "q.test_policy_acked",
    data: { id: "c" },
    seq: 3,
    refuseAck: true,
  });

  const { result } = await dispatchProbes([first, second, third]);

  expect(called, equals(1));
  expect(
    [first.acked && first.nakedAfter === null, second.acked && second.nakedAfter === null],
    equals([true, true]),
    "the group acknowledges its members one at a time inside the guarded try, so an ack " +
      "that throws sends the whole group down the failure path and the members already " +
      "acknowledged are refused on top of their acknowledgement",
  );
  expect(result.done, equals(2));
});

Scribe.test("a group whose acknowledgement failed on its last delivery is dead-lettered after being acknowledged", async () => {
  new Queue<{ id: string }>(
    { name: "test:policy:acked-spent", batch: { lingerMs: 5 }, options: { maxRetries: CEILING } },
    () => Promise.resolve(),
  );

  const done = probe({
    subject: "q.test_policy_acked-spent",
    data: { id: "a" },
    seq: 1,
    deliveryCount: CEILING,
  });
  const refusing = probe({
    subject: "q.test_policy_acked-spent",
    data: { id: "b" },
    seq: 2,
    deliveryCount: CEILING,
    refuseAck: true,
  });

  const { published } = await dispatchProbes([done, refusing]);

  expect(
    published.map((one) => one.data),
    equals([{ id: "b" }]),
    "the member whose body agreed and whose acknowledgement went through is written to the " +
      "dead letter anyway, so a job that succeeded is filed as a failure and whatever " +
      "reads the dead letter runs it a second time",
  );
  expect(done.acked, equals(true));
});

Scribe.test("a dead letter that is written names the payload and the subject it came from", async () => {
  const message = spent("q.test_policy_serial", 1);

  const { published, result } = await dispatchProbes([message]);

  expect(published, equals([{ subject: "dead.test_policy_serial", data: { id: "j1" } }]));
  expect(result.dead, equals(1));
  expect(message.termed, equals(true));
});

Scribe.test("a body that refuses does not reach the dead letter at all", async () => {
  const message = probe({ subject: "q.test_policy_serial", data: { id: "a" }, deliveryCount: 1 });

  const { published } = await dispatchProbes([message]);

  expect(
    published,
    equals([]),
    "a retry costs one local refusal and nothing is written anywhere, which is what keeps a " +
      "failing queue from doubling the traffic of a healthy one",
  );
});
