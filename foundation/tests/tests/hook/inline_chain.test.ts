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

import { installDrivers } from "../../testing/drivers.ts";
import { InlineChain } from "../../../lib/src/hook/inline_chain.ts";
import { isRefusal } from "../../../lib/src/hook/is_refusal.ts";
import { assert, assertEquals, assertFalse, assertRejects } from "@std/assert";

installDrivers();

Deno.test("isRefusal only recognises an object carrying ok:false", () => {
  assert(isRefusal({ ok: false }));
  assert(isRefusal({ ok: false, reason: "nope" }));

  assertFalse(isRefusal({ ok: true }));
  assertFalse(isRefusal({}));
  assertFalse(isRefusal(null));
  assertFalse(isRefusal(undefined));
  assertFalse(isRefusal(false));
  assertFalse(isRefusal("ok"));
});

Deno.test("InlineChain with no handler yields the fallback", async () => {
  const chain = new InlineChain<string, string>("empty", "fallback");

  assertEquals(await chain.run("payload"), "fallback");
  assertEquals(chain.size, 0);
});

Deno.test("InlineChain runs handlers in order and keeps the last outcome", async () => {
  const seen: string[] = [];
  const chain = new InlineChain<string, string>("ordered", "fallback");

  chain.add((p) => {
    seen.push(`a:${p}`);
    return "a";
  });
  chain.add(() => {
    seen.push("b");
    return "b";
  });

  assertEquals(await chain.run("x"), "b");
  assertEquals(seen, ["a:x", "b"]);
  assertEquals(chain.size, 2);
});

Deno.test("InlineChain short-circuits on the first refusal", async () => {
  const seen: string[] = [];
  const chain = new InlineChain<string, { ok: boolean }>("gate", { ok: true });

  chain.add(() => {
    seen.push("first");
    return { ok: true };
  });
  chain.add(() => {
    seen.push("refuses");
    return { ok: false };
  });
  chain.add(() => {
    seen.push("never");
    return { ok: true };
  });

  assertEquals(await chain.run("x"), { ok: false });
  assertEquals(seen, ["first", "refuses"]);
});

Deno.test("InlineChain lets a handler failure propagate", async () => {
  const chain = new InlineChain<string, string>("boom", "fallback");
  chain.add(() => {
    throw new Error("handler exploded");
  });
  chain.add(() => "never reached");

  await assertRejects(() => chain.run("x"), Error, "handler exploded");
});

Deno.test("InlineChain awaits an asynchronous handler", async () => {
  const chain = new InlineChain<number, number>("async", 0);
  chain.add((n) => Promise.resolve(n * 2));

  assertEquals(await chain.run(21), 42);
});
