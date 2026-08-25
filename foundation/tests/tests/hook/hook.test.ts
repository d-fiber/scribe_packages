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

import { installDrivers } from "@scribe/foundation/tests/testing/drivers.ts";
import { Hook } from "@scribe/foundation/lib/src/hook/hook.ts";
import { hookRegistry } from "@scribe/foundation/lib/src/hook/hook_registry.ts";
import { Failure, okay, type Result } from "@scribe/alchemy";
import { assertEquals, assertRejects, assertStrictEquals, assertThrows } from "@std/assert";

installDrivers();

Deno.test("hook.on() returns the handler unchanged", () => {
  const hook = new Hook<string>({ name: "test.returns-handler" });
  const handler = (_payload: string): Promise<void> => Promise.resolve();

  assertStrictEquals(hook.on(handler), handler);
});

Deno.test("hook.run() passes the payload and returns the handler's result", async () => {
  const hook = new Hook<{ value: string }, string>({
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
  const hook = new Hook<undefined, string>({
    name: "test.fallback",
    fallback: "no-op",
  });

  assertEquals(await hook.run(undefined), "no-op");
});

Deno.test("hook.run() chains handlers in registration order", async () => {
  const hook = new Hook<string>({ name: "test.order" });
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
  const hook = new Hook<string, Result<void, string>>({
    name: "test.refusal",
    fallback: okay,
  });
  let secondRan = false;

  hook.on(() => new Failure("refused"));
  hook.on(() => {
    secondRan = true;
    return okay;
  });

  const result = await hook.run("x");

  assertEquals(result.ok, false);
  assertEquals(secondRan, false);
});

Deno.test("hook.run() propagates a handler's error to the caller", async () => {
  const hook = new Hook<string>({ name: "test.rejects" });
  hook.on(() => Promise.reject(new Error("boom")));

  await assertRejects(() => hook.run("x"), Error, "boom");
});

Deno.test("hook.run() turns a synchronous throw into a rejection", async () => {
  const hook = new Hook<string>({ name: "test.throws" });
  hook.on(() => {
    throw new Error("boom");
  });

  await assertRejects(() => hook.run("x"), Error, "boom");
});

Deno.test("new Hook() refuses two hooks with the same name", () => {
  new Hook<string>({ name: "test.duplicate" });

  assertThrows(() => new Hook<string>({ name: "test.duplicate" }));
});

Deno.test("the registry knows which hooks have no handler", () => {
  new Hook<string>({ name: "test.idle" });

  const report = hookRegistry.report();

  assertEquals(report.includes("test.idle"), true);
  assertEquals(report.startsWith("[hooks]"), true);
});

Deno.test("background() does not run the handler within the request", async () => {
  const hook = new Hook<{ id: string }>({ name: "test.background" });
  let inlineRan = false;
  let backgroundRan = false;

  hook.on(() => {
    inlineRan = true;
  });
  hook.background(() => {
    backgroundRan = true;
  });

  await hook.run({ id: "x" });

  assertEquals(inlineRan, true, "the inline handler ran within run()");
  assertEquals(
    backgroundRan,
    false,
    "the background handler was pushed rather than called, and the push failing on the " +
      "absent NATS did not hold run() back",
  );
});

Deno.test("handlers() counts inline and background subscribers together", () => {
  const hook = new Hook<string>({ name: "test.background.count" });

  assertEquals(hook.handlers(), 0);
  hook.on(() => {});
  assertEquals(hook.handlers(), 1);
  hook.background(() => {});
  assertEquals(hook.handlers(), 2);
});

Deno.test("a hook nobody listens to answers without doing any work", () => {
  const hook = new Hook<string, string>({
    name: "test.unhandled",
    fallback: "no-op",
  });

  assertStrictEquals(
    hook.run("a"),
    hook.run("b"),
    "two emissions answered the same promise instance, so neither allocated anything",
  );
});

Deno.test("a hook stops answering from the fast path once someone subscribes", async () => {
  const hook = new Hook<string, string>({
    name: "test.becomes-handled",
    fallback: "no-op",
  });
  const before = hook.run("a");

  hook.on(() => "handled");

  assertStrictEquals(before === hook.run("b"), false);
  assertEquals(await hook.run("c"), "handled");
});

Deno.test("a synchronous chain is not made to wait on itself", async () => {
  const hook = new Hook<string, string>({ name: "test.sync", fallback: "none" });
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
