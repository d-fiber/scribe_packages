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

import { Hook } from "@scribe/foundation/lib/src/hook/mod.ts";
import { assert, assertEquals } from "@std/assert";
import { report, timed } from "./support/stack.ts";

Deno.test("hook: with nobody listening, the fallback comes back", async () => {
  const hook = new Hook<{ v: number }, string>({
    name: "e2e-fallback",
    fallback: "nothing",
  });

  assertEquals(hook.handlers(), 0);
  assertEquals(await hook.run({ v: 1 }), "nothing");
});

Deno.test("hook: subscribers run in the order they registered", async () => {
  const order: string[] = [];
  const hook = new Hook<{ v: number }, void>({ name: "e2e-order" });

  hook.on((payload) => {
    order.push(`first:${payload.v}`);
  });
  hook.on(() => {
    order.push("second");
  });
  hook.on(() => {
    order.push("third");
  });

  await hook.run({ v: 7 });

  assertEquals(order, ["first:7", "second", "third"]);
  assertEquals(hook.handlers(), 3);
});

Deno.test("hook: the last outcome is the one the caller gets", async () => {
  const hook = new Hook<number, string>({
    name: "e2e-outcome",
    fallback: "none",
  });

  hook.on(() => "from the first");
  hook.on(() => "from the second");

  assertEquals(await hook.run(1), "from the second");
});

Deno.test("hook: a refusal stops the chain where it happened", async () => {
  const reached: string[] = [];
  const hook = new Hook<number, { ok: boolean }>({
    name: "e2e-refusal",
    fallback: { ok: true },
  });

  hook.on(() => {
    reached.push("before");
    return { ok: true };
  });
  hook.on(() => {
    reached.push("refuses");
    return { ok: false };
  });
  hook.on(() => {
    reached.push("after");
    return { ok: true };
  });

  assertEquals(await hook.run(1), { ok: false });
  assertEquals(reached, ["before", "refuses"], "nothing runs past a refusal");
});

Deno.test(
  "hook: an emit nobody listens to is cheap enough for a hot path",
  async () => {
    const hook = new Hook<{ v: number }, void>({ name: "e2e-cost" });
    const count = 100_000;

    const [, ms] = await timed(async () => {
      for (let i = 0; i < count; i++) await hook.run({ v: i });
    });
    const microseconds = (ms / count) * 1000;

    report(
      `${count} emits with nobody listening`,
      `${microseconds.toFixed(3)} microseconds each`,
    );
    assert(
      microseconds < 5,
      "an unlistened hook has to cost about nothing, or it cannot be left in place",
    );
  },
);
