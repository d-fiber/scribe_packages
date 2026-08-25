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
import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { Failure, okay, type Result } from "@scribe/alchemy";
import { Hook } from "../../../lib/src/hook/hook.ts";
import { Duration } from "@scribe/alchemy";
import { InlineChain } from "../../../lib/src/hook/inline_chain.ts";
import { isRefusal } from "../../../lib/src/hook/is_refusal.ts";

installDrivers();

Deno.test("a handler that subscribes during the emission is called by that same emission", () => {
  const chain = new InlineChain<string, string>("hardening.subscribe-inside", "none");
  const seen: string[] = [];

  chain.add(() => {
    seen.push("first");
    chain.add(() => {
      seen.push("late");
      return "late";
    });
    return "first";
  });
  chain.add(() => {
    seen.push("second");
    return "second";
  });

  return chain.run("x").then((answer) => {
    assertEquals(seen, ["first", "second", "late"]);
    assertEquals(answer, "late", "the subscriber that did not exist when the event started decided it");
  });
});

Deno.test("a chain a handler grows on every emission grows without bound", async () => {
  const chain = new InlineChain<string, string>("hardening.grows", "none");
  chain.add(() => {
    chain.add(() => "leaf");
    return "root";
  });

  await chain.run("x");
  await chain.run("x");
  await chain.run("x");

  assertEquals(
    chain.size >= 4,
    true,
    "nothing takes a handler back off, so a subscriber added per request stays for the life of " +
      "the process",
  );
});

Deno.test("no subscriber can be taken back off, on either side of a hook", () => {
  const hook = new Hook<string, void>({ name: "hardening.no-unsubscribe" });
  const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(hook));

  assertEquals(surface.includes("off"), false);
  assertEquals(surface.includes("remove"), false);
  assertEquals(
    hook.on(() => {}) !== null,
    true,
    "on() answers the handler back so a caller can keep a reference, and there is nothing to " +
      "hand it to",
  );
});

Deno.test("two thousand synchronous subscribers all run, in order", async () => {
  const chain = new InlineChain<number, number>("hardening.two-thousand", -1);
  let called = 0;
  for (let i = 0; i < 2000; i++) {
    chain.add(() => {
      called++;
      return i;
    });
  }

  assertEquals(await chain.run(0), 1999);
  assertEquals(called, 2000);
});

Deno.test("a handler answering undefined answers for the whole chain, fallback and all", async () => {
  const chain = new InlineChain<string, string | undefined>("hardening.undefined", "declared");
  chain.add(() => undefined);

  assertEquals(
    await chain.run("x"),
    undefined,
    "a handler that decided nothing replaced the answer the declaration wrote down",
  );
});

Deno.test("a plain record carrying ok:false stops the chain without being a Result", async () => {
  const hook = new Hook<string, Result<void, string> | { ok: false; why: string }>({
    name: "hardening.looks-like-a-refusal",
    fallback: okay,
  });
  let secondRan = false;

  hook.on(() => ({ ok: false, why: "the feature is off" }));
  hook.on(() => {
    secondRan = true;
    return okay;
  });

  assertEquals(isRefusal(await hook.run("x")), true);
  assertEquals(secondRan, false, "any answer shaped like a failure is read as one");
});

Deno.test({
  name: "a refusal the engine cannot see: a callable carrying ok:false lets the chain run on",
  fn: async () => {
    const refusal = Object.assign(() => {}, { ok: false as const });
    const chain = new InlineChain<string, typeof refusal | string>("hardening.callable", "none");
    let secondRan = false;

    chain.add(() => refusal);
    chain.add(() => {
      secondRan = true;
      return "ran";
    });

    await chain.run("x");

    assertEquals(
      secondRan,
      false,
      "isRefusal() tests typeof === object, so a refusal that is also callable reads as an " +
        "acceptance, the chain keeps going and the background work is queued",
    );
  },
});

Deno.test({
  name: "a handler answering a thenable that never calls back parks the emission for good",
  fn: async () => {
    const chain = new InlineChain<string, unknown>(
      "hardening.dead-thenable",
      null,
      Duration.milliseconds(20),
    );
    chain.add(() => ({ then: () => {} }));

    let tick: ReturnType<typeof setTimeout> | 0 = 0;
    const answered = await Promise.race([
      chain.run("x").then(() => "answered"),
      new Promise((resolve) => {
        tick = setTimeout(() => resolve("parked"), 50);
      }),
    ]);
    clearTimeout(tick);

    assertEquals(
      answered,
      "answered",
      "the chain awaits anything carrying a then, and nothing puts a deadline on it, so the " +
        "request holding this emission is held for as long as the process lives",
    );
  },
});

Deno.test("a handler that throws synchronously rejects the emission and leaves the rest alone", async () => {
  const hook = new Hook<string, void>({ name: "hardening.sync-throw" });
  let secondRan = false;

  hook.on(() => {
    throw new Error("thrown before any await");
  });
  hook.on(() => {
    secondRan = true;
  });

  await assertRejects(() => hook.run("x"), Error, "thrown before any await");
  assertEquals(secondRan, false);
});

Deno.test("a handler answering a rejected promise rejects the emission", async () => {
  const hook = new Hook<string, void>({ name: "hardening.async-throw" });

  hook.on(() => Promise.reject(new Error("rejected")));

  await assertRejects(() => hook.run("x"), Error, "rejected");
});

Deno.test("a refusal keeps the deferred half of the event from being queued", async () => {
  const hook = new Hook<{ id: string }, Result<void, string>>({
    name: "hardening.refusal-stops-background",
    fallback: okay,
  });
  let deferred = 0;

  hook.on(() => new Failure("no"));
  hook.background(() => {
    deferred++;
  });

  assertEquals((await hook.run({ id: "x" })).ok, false);
  assertEquals(deferred, 0);
});

Deno.test({
  name: "a handler that emits its own hook recurses until something else stops it",
  fn: async () => {
    const hook = new Hook<number, void>({ name: "hardening.reentrant" });
    let depth = 0;

    hook.on((n) => {
      depth++;
      if (depth < 200) return hook.run(n);
    });

    await hook.run(1);

    assertEquals(
      depth,
      1,
      "nothing marks a hook as being emitted, so a handler that emits the hook it is on nests " +
        "one emission inside the last until the counter it happens to carry stops it",
    );
  },
});

Deno.test("an emission with only a deferred subscriber still answers the declared fallback", async () => {
  const hook = new Hook<{ id: string }, string>({
    name: "hardening.background-only",
    fallback: "declared",
  });
  hook.background(() => {});

  assertEquals(await hook.run({ id: "x" }), "declared");
});

Deno.test("a hook nobody listens to hands out one promise for the life of the process", () => {
  const hook = new Hook<string, string>({ name: "hardening.idle-identity", fallback: "none" });

  assertStrictEquals(hook.run("a"), hook.run("b"));
});
