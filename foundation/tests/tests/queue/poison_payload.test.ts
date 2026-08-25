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

import { installDrivers } from "@scribe/foundation/tests/testing/drivers.ts";
import { Queue } from "@scribe/foundation/lib/src/queue/queue.ts";
import { dispatchProbes, probe, unanswered } from "./probe.ts";
import { assertEquals, assertNotEquals } from "@std/assert";

installDrivers();

const handled: unknown[] = [];

new Queue<unknown>(
  { name: "test:poison:serial", options: { concurrency: 1 } },
  (job) => {
    handled.push(job);
    return Promise.resolve();
  },
);

new Queue<unknown>(
  { name: "test:poison:group", batch: { lingerMs: 5 } },
  (jobs) => {
    handled.push(...jobs);
    return Promise.resolve();
  },
);

Deno.test({
  name: "one unparseable payload leaves every later message of its queue unanswered",
  fn: async () => {
    const poison = probe({ subject: "q.test_poison_serial", raw: "{ not json", seq: 1 });
    const second = probe({ subject: "q.test_poison_serial", data: { id: "b" }, seq: 2 });
    const third = probe({ subject: "q.test_poison_serial", data: { id: "c" }, seq: 3 });

    const { rejected } = await dispatchProbes([poison, second, third]);

    assertEquals(
      rejected,
      null,
      "a payload nobody can read must not throw out of the pass: the exception escapes " +
        "runPooled, the dispatcher and the drain, and the whole pass is lost",
    );
    assertEquals(
      unanswered(second) || unanswered(third),
      false,
      "the messages queued behind the unreadable one were never acknowledged, retried or " +
        "terminated, so they hold their consumer slot until ack_wait expires",
    );
  },
});

Deno.test({
  name: "an unparseable payload is never routed to the dead letter, so it comes back forever",
  fn: async () => {
    const poison = probe({
      subject: "q.test_poison_serial",
      raw: "{ not json",
      deliveryCount: 99,
    });

    const { published } = await dispatchProbes([poison]);

    assertEquals(
      published.map((one) => one.subject),
      ["dead.test_poison_serial"],
      "a payload that cannot be decoded can never succeed, so it belongs on the dead letter " +
        "on its first delivery rather than being redelivered until the server gives up",
    );
  },
});

Deno.test({
  name: "one unparseable payload in a group takes the whole group down with it",
  fn: async () => {
    const poison = probe({ subject: "q.test_poison_group", raw: "]]]", seq: 1 });
    const healthy = probe({ subject: "q.test_poison_group", data: { id: "b" }, seq: 2 });

    const { rejected } = await dispatchProbes([poison, healthy]);

    assertEquals(rejected, null, "the group is decoded outside the guarded call");
    assertEquals(
      unanswered(healthy),
      false,
      "a readable message travelling beside an unreadable one is dropped on the floor",
    );
  },
});

Deno.test({
  name: "a payload of literal null throws where nothing catches it",
  fn: async () => {
    const empty = probe({ subject: "q.test_poison_serial", raw: "null" });

    const { rejected } = await dispatchProbes([empty]);

    assertEquals(rejected, null, "reading .data off a decoded null happens outside the try");
  },
});

Deno.test("a payload whose envelope is a bare number never reaches the body", async () => {
  handled.length = 0;
  const odd = probe({ subject: "q.test_poison_serial", raw: "3" });

  const { result, rejected } = await dispatchProbes([odd]);

  assertEquals(rejected, null);
  assertEquals(handled, [], "a number carries no data, so there is nothing to hand a body");
  assertEquals(result.done, 0);
  assertEquals(odd.acked, false);
});

Deno.test("a payload carrying the wildcard separators of the protocol survives the wire", async () => {
  handled.length = 0;
  const hostile = { subject: "q.>", filter: "*.*", token: "a.b.c", glob: "dead.*" };
  const message = probe({ subject: "q.test_poison_serial", data: hostile });

  const { result } = await dispatchProbes([message]);

  assertEquals(result.done, 1);
  assertEquals(handled, [hostile]);
});

Deno.test("a payload of ten thousand characters is handed over untouched", async () => {
  handled.length = 0;
  const long = "é".repeat(10_000);
  const message = probe({ subject: "q.test_poison_serial", data: { long } });

  const { result } = await dispatchProbes([message]);

  assertEquals(result.done, 1);
  assertEquals((handled[0] as { long: string }).long.length, 10_000);
});

Deno.test("a payload whose envelope names a second data key keeps the outer one", async () => {
  handled.length = 0;
  const message = probe({
    subject: "q.test_poison_serial",
    raw: JSON.stringify({ data: { data: "inner" }, attempts: 7 }),
  });

  const { result } = await dispatchProbes([message]);

  assertEquals(result.done, 1);
  assertEquals(handled, [{ data: "inner" }]);
  assertNotEquals(handled[0], "inner");
});
