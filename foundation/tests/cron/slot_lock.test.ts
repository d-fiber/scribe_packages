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

import { SlotLock } from "@scribe/foundation/lib/src/cron/runner/slot_lock.ts";
import type { Scheduled } from "@scribe/foundation/lib/src/cron/schedule/mod.ts";
import { Time } from "@scribe/core/contracts/common/time.ts";
import { assertEquals, assertNotEquals } from "@std/assert";

function intervalJob(name: string, ms: number): Scheduled {
  return {
    name,
    schedule: { kind: "interval", ms },
    timeout: Time.seconds(30),
  } as unknown as Scheduled;
}

function cronJob(name: string): Scheduled {
  return {
    name,
    schedule: { kind: "cron" },
    timeout: Time.seconds(30),
  } as unknown as Scheduled;
}

const lock = new SlotLock();

Deno.test("SlotLock floors an interval slot so every instance agrees on the key", () => {
  const job = intervalJob("cleanup", 60_000);

  const a = lock.keyFor(job, new Date(1_700_000_040_000));
  const b = lock.keyFor(job, new Date(1_700_000_059_999));

  assertEquals(a, b);
  assertEquals(a, "cron:lock:cleanup:1700000040000");
});

Deno.test("SlotLock gives consecutive interval slots distinct keys", () => {
  const job = intervalJob("cleanup", 60_000);

  assertNotEquals(
    lock.keyFor(job, new Date(1_700_000_040_000)),
    lock.keyFor(job, new Date(1_700_000_100_000)),
  );
});

Deno.test("SlotLock uses the exact instant for a calendar schedule", () => {
  const at = new Date(1_700_000_012_345);

  assertEquals(lock.keyFor(cronJob("digest"), at), "cron:lock:digest:1700000012345");
});

Deno.test("SlotLock namespaces by job name", () => {
  const at = new Date(1_700_000_040_000);

  assertNotEquals(
    lock.keyFor(intervalJob("a", 60_000), at),
    lock.keyFor(intervalJob("b", 60_000), at),
  );
});
