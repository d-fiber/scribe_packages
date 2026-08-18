// Copyright (C) 2026 Fiber
//
// This file is part of scribe and is made available under the PolyForm Shield
// License 1.0.0. The full terms are in the LICENSE file at the root of this
// repository, and at https://polyformproject.org/licenses/shield/1.0.0
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
//
// The one thing you may not do:
// - Use it to provide any product that competes with scribe, or with any
//   product Fiber or its affiliates provide using scribe. Products compete
//   even when they are offered free of charge, through a different kind of
//   interface, or for a different technical platform.
//
// If you pass this software on:
// - Anyone who receives any part of it from you must also receive these terms,
//   or the URL above, together with the "Required Notice" line carried by the
//   LICENSE file.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE COMES AS IS, WITHOUT ANY WARRANTY OR
// CONDITION, AND THE LICENSOR WILL NOT BE LIABLE TO YOU FOR ANY DAMAGES ARISING
// OUT OF THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY KIND OF
// LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

import { InlineChain } from "@scribe/foundation/src/hook/core/inline_chain.ts";
import { isRefusal } from "@scribe/foundation/src/hook/core/refusal.ts";
import { assert, assertEquals, assertFalse, assertRejects } from "@std/assert";

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
