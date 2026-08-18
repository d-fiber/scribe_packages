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

// The engine no longer has a global flag: a hook runs as soon as a handler is
// registered, full stop. There is therefore nothing left to initialize before
// these tests, and no shared state across test files. The only constraint is
// that a hook name is unique per process (the registry guarantees it), hence the
// distinct names below.

import { defineHook, hookRegistry } from "@scribe/foundation/src/hook/mod.ts";
import { Failure, OK, type Result } from "@scribe/core/contracts/result.ts";
import { assertEquals, assertRejects, assertStrictEquals, assertThrows } from "@std/assert";

Deno.test("hook.on() returns the handler unchanged", () => {
  const hook = defineHook<string>({ name: "test.returns-handler" });
  const handler = (_payload: string): Promise<void> => Promise.resolve();

  assertStrictEquals(hook.on(handler), handler);
});

Deno.test("hook.run() passes the payload and returns the handler's result", async () => {
  const hook = defineHook<{ value: string }, string>({
    name: "test.payload",
    fallback: "none",
  });
  let received: { value: string } | null = null;

  hook.on((payload) => {
    received = payload;
    return `handled:${payload.value}`;
  });

  assertEquals(await hook.run({ value: "x" }), "handled:x");
  assertEquals(received, { value: "x" });
});

Deno.test("hook.run() returns the fallback when no handler is registered", async () => {
  const hook = defineHook<undefined, string>({
    name: "test.fallback",
    fallback: "no-op",
  });

  assertEquals(await hook.run(undefined), "no-op");
});

Deno.test("hook.run() chains handlers in registration order", async () => {
  const hook = defineHook<string>({ name: "test.order" });
  const calls: string[] = [];

  hook.on(() => {
    calls.push("first");
  });
  hook.on(() => {
    calls.push("second");
  });

  await hook.run("x");

  assertEquals(calls, ["first", "second"]);
});

Deno.test("hook.run() stops at the first refusal, like an early return", async () => {
  const hook = defineHook<string, Result<void, string>>({
    name: "test.refusal",
    fallback: new OK(),
  });
  let secondRan = false;

  hook.on(() => new Failure("refused"));
  hook.on(() => {
    secondRan = true;
    return new OK();
  });

  const result = await hook.run("x");

  assertEquals(result.ok, false);
  assertEquals(secondRan, false);
});

Deno.test("hook.run() propagates a handler's error to the caller", async () => {
  const hook = defineHook<string>({ name: "test.rejects" });
  hook.on(() => Promise.reject(new Error("boom")));

  await assertRejects(() => hook.run("x"), Error, "boom");
});

Deno.test("hook.run() convertit un throw synchrone en rejet", async () => {
  const hook = defineHook<string>({ name: "test.throws" });
  hook.on(() => {
    throw new Error("boom");
  });

  await assertRejects(() => hook.run("x"), Error, "boom");
});

Deno.test("defineHook() refuses two hooks with the same name", () => {
  defineHook<string>({ name: "test.duplicate" });

  assertThrows(() => defineHook<string>({ name: "test.duplicate" }));
});

Deno.test("the registry knows which hooks have no handler", () => {
  defineHook<string>({ name: "test.idle" });

  const report = hookRegistry.report();

  assertEquals(report.includes("test.idle"), true);
  assertEquals(report.startsWith("[hooks]"), true);
});

Deno.test("background() does not run the handler within the request", async () => {
  const hook = defineHook<{ id: string }>({ name: "test.background" });
  let inlineRan = false;
  let backgroundRan = false;

  hook.on(() => {
    inlineRan = true;
  });
  hook.background(() => {
    backgroundRan = true;
  });

  // The push goes to NATS, absent in tests: it fails, is traced, and does not
  // prevent `run()` from returning. That is precisely what we want to check:
  // the background handler is never called inline.
  await hook.run({ id: "x" });

  assertEquals(inlineRan, true);
  assertEquals(backgroundRan, false);
});

Deno.test("handlers() counts both inline AND background subscribers", () => {
  const hook = defineHook<string>({ name: "test.background.count" });

  assertEquals(hook.handlers(), 0);
  hook.on(() => {});
  assertEquals(hook.handlers(), 1);
  hook.background(() => {});
  assertEquals(hook.handlers(), 2);
});

Deno.test("a hook nobody listens to answers without doing any work", () => {
  const hook = defineHook<string, string>({
    name: "test.unhandled",
    fallback: "no-op",
  });

  // The same promise instance every time is what says the emission allocated nothing. A
  // framework declares far more extension points than a project uses, and they are emitted
  // on the hot paths.
  assertStrictEquals(hook.run("a"), hook.run("b"));
});

Deno.test("a hook stops answering from the fast path once someone subscribes", async () => {
  const hook = defineHook<string, string>({
    name: "test.becomes-handled",
    fallback: "no-op",
  });
  const before = hook.run("a");

  hook.on(() => "handled");

  assertStrictEquals(before === hook.run("b"), false);
  assertEquals(await hook.run("c"), "handled");
});

Deno.test("a synchronous chain is not made to wait on itself", async () => {
  const hook = defineHook<string, string>({ name: "test.sync", fallback: "none" });
  const order: string[] = [];

  hook.on((p) => {
    order.push(`first:${p}`);
    return "first";
  });
  hook.on((p) => {
    order.push(`second:${p}`);
    return "second";
  });

  assertEquals(await hook.run("x"), "second");
  assertEquals(order, ["first:x", "second:x"]);
});
