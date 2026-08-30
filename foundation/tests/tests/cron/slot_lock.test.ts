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
import { equals, expect, isNot, Scribe } from "@scribe/alchemy/test";
import "../../testing/settings.ts";

import { SlotLock } from "../../../lib/src/cron/slot_lock.ts";
import type { Scheduled } from "../../../lib/src/cron/schedule.ts";
import { Duration } from "@scribe/alchemy";

function intervalJob(name: string, every: Duration): Scheduled {
  return { name, schedule: { kind: "interval", every }, timeout: Duration.seconds(30) };
}

function cronJob(name: string): Scheduled {
  return {
    name,
    schedule: { kind: "cron" },
    timeout: Duration.seconds(30),
  } as unknown as Scheduled;
}

const lock = new SlotLock();

Scribe.test("SlotLock floors an interval slot so every instance agrees on the key", () => {
  const job = intervalJob("cleanup", Duration.milliseconds(60_000));

  const a = lock.keyFor(job, new Date(1_700_000_040_000));
  const b = lock.keyFor(job, new Date(1_700_000_059_999));

  expect(a, equals(b));
  expect(a, equals("cron:lock:cleanup:1700000040000"));
});

Scribe.test("SlotLock gives consecutive interval slots distinct keys", () => {
  const job = intervalJob("cleanup", Duration.milliseconds(60_000));

  expect(lock.keyFor(job, new Date(1_700_000_040_000)), isNot(equals(lock.keyFor(job, new Date(1_700_000_100_000)))));
});

Scribe.test("SlotLock uses the exact instant for a calendar schedule", () => {
  const at = new Date(1_700_000_012_345);

  expect(lock.keyFor(cronJob("digest"), at), equals("cron:lock:digest:1700000012345"));
});

Scribe.test("SlotLock namespaces by job name", () => {
  const at = new Date(1_700_000_040_000);

  expect(
    lock.keyFor(intervalJob("a", Duration.milliseconds(60_000)), at),
    isNot(equals(lock.keyFor(intervalJob("b", Duration.milliseconds(60_000)), at))),
  );
});

Scribe.test("the lease covers the occurrence the key names, not the time the body is given", () => {
  const quarterly = intervalJob("sweep", Duration.minutes(15));
  const slot = new Date(0);

  expect(lock.leaseFor(quarterly, slot).inMinutes, equals(15));
  expect(lock.leaseFor(quarterly, slot).inMinutes, isNot(equals(quarterly.timeout.inMinutes)));
});

Scribe.test("a job given longer than its own interval keeps the marker for as long as it runs", () => {
  const slow: Scheduled = {
    name: "slow",
    schedule: { kind: "interval", every: Duration.minutes(1) },
    timeout: Duration.minutes(10),
  };

  expect(lock.leaseFor(slow, new Date(0)).inMinutes, equals(10));
});

Scribe.test("a second replica reaching a current occurrence finds it already spoken for", () => {
  const quarterly = intervalJob("sweep", Duration.minutes(15));
  const cell = new Date(0);
  const lease = lock.leaseFor(quarterly, cell).inMilliseconds;

  for (const arrivalMinutes of [0, 7, 14]) {
    const arrival = new Date(arrivalMinutes * 60_000);
    expect(lock.keyFor(quarterly, arrival), equals(lock.keyFor(quarterly, cell)));
    expect(arrival.getTime() - cell.getTime() < lease, equals(true), `t+${arrivalMinutes} min`);
  }
});
