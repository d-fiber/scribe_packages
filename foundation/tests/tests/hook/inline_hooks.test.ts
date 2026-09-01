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
import { InlineHooks } from "../../../lib/src/hook/inline_hooks.ts";

installDrivers();

Scribe.test("opening a point declares it, and a subscriber on it is called on emit", async () => {
  const driver = new InlineHooks();
  const point = driver.open<{ id: string }>({ event: "test.inline-hooks.basic" });
  let received: { id: string } | null = null;

  point.on((payload) => {
    received = payload;
  });
  await point.emit({ id: "x" });

  expect<{ id: string } | null>(received, equals({ id: "x" }));
});

Scribe.test("opening the same event twice answers a point over the same chain", async () => {
  const driver = new InlineHooks();
  const first = driver.open<string>({ event: "test.inline-hooks.reopened" });
  const second = driver.open<string>({ event: "test.inline-hooks.reopened" });

  let calls = 0;
  first.on(() => {
    calls++;
  });
  await second.emit("x");

  expect(
    calls,
    equals(1),
    "a subscriber on the first handle is reached through the second, since both name the same point",
  );
});

Scribe.test("emit answers void even when the underlying chain has a decision", async () => {
  const driver = new InlineHooks();
  const point = driver.open<string>({ event: "test.inline-hooks.void" });
  point.on(() => {});

  const answer = await point.emit("x");

  expect(answer, equals(undefined));
});

Scribe.test("two different events opened on the same driver do not share subscribers", async () => {
  const driver = new InlineHooks();
  const a = driver.open<string>({ event: "test.inline-hooks.a" });
  const b = driver.open<string>({ event: "test.inline-hooks.b" });

  let aCalls = 0;
  let bCalls = 0;
  a.on(() => {
    aCalls++;
  });
  b.on(() => {
    bCalls++;
  });

  await a.emit("x");

  expect(aCalls, equals(1));
  expect(bCalls, equals(0));
});
