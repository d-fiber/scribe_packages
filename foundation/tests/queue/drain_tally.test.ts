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

import { DrainTally } from "@scribe/foundation/lib/src/queue/runner/drain_tally.ts";
import { TimeoutException, withDeadline } from "@scribe/alchemy";
import { assertEquals, assertInstanceOf, assertRejects } from "@std/assert";
import { Duration } from "@scribe/alchemy";

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
  assertEquals(await withDeadline("fast", Duration.milliseconds(50), Promise.resolve("ok")), "ok");
});

Deno.test("withDeadline rejects with TimeoutException past the deadline", async () => {
  let release: (value: string) => void = () => {};
  const pending = new Promise<string>((resolve) => {
    release = resolve;
  });

  const error = await assertRejects(() => withDeadline("slow", Duration.milliseconds(5), pending));
  assertInstanceOf(error, TimeoutException);

  release("late");
  await pending;
});

Deno.test("withDeadline propagates the handler's own failure untouched", async () => {
  const boom = new TypeError("handler exploded");

  const error = await assertRejects(() =>
    withDeadline("broken", Duration.milliseconds(50), Promise.reject(boom))
  );

  assertEquals(error, boom);
});
