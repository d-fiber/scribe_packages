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
import "@scribe/testing/runner.ts";
import {
  allOf,
  equals,
  expect,
  expectLater,
  isA,
  isNotNull,
  same,
  Scribe,
  throwsA,
  withMessage,
} from "@scribe/alchemy/test";
import { installDrivers } from "../../testing/drivers.ts";
import { Hook } from "../../../lib/src/hook/hook.ts";
import { hookRegistry } from "../../../lib/src/hook/hook_registry.ts";
import { Failure, okay, type Result } from "@scribe/alchemy";
installDrivers();

Scribe.test("hook.on() returns the handler unchanged", () => {
  const hook = new Hook<string>({ name: "test.returns-handler" });
  const handler = (_payload: string): Promise<void> => Promise.resolve();

  expect(hook.on(handler), same(handler));
});

Scribe.test("hook.run() passes the payload and returns the handler's result", async () => {
  const hook = new Hook<{ value: string }, string>({
    name: "test.payload",
    fallback: "none",
  });
  let received: { value: string } | null = null;

  hook.on((payload) => {
    received = payload;
    return `handled:${payload.value}`;
  });

  expect(await hook.run({ value: "x" }), equals("handled:x"));
  expect<{ value: string } | null>(received, equals({ value: "x" }));
});

Scribe.test("hook.run() returns the fallback when no handler is registered", async () => {
  const hook = new Hook<undefined, string>({
    name: "test.fallback",
    fallback: "no-op",
  });

  expect(await hook.run(undefined), equals("no-op"));
});

Scribe.test("hook.run() chains handlers in registration order", async () => {
  const hook = new Hook<string>({ name: "test.order" });
  const calls: string[] = [];

  hook.on(() => {
    calls.push("first");
  });
  hook.on(() => {
    calls.push("second");
  });

  await hook.run("x");

  expect(calls, equals(["first", "second"]));
});

Scribe.test("hook.run() stops at the first refusal, like an early return", async () => {
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

  expect(result.ok, equals(false));
  expect(secondRan, equals(false));
});

Scribe.test("hook.run() propagates a handler's error to the caller", async () => {
  const hook = new Hook<string>({ name: "test.rejects" });
  hook.on(() => Promise.reject(new Error("boom")));

  await expectLater(() => hook.run("x"), throwsA(allOf(isA(Error), withMessage("boom"))));
});

Scribe.test("hook.run() turns a synchronous throw into a rejection", async () => {
  const hook = new Hook<string>({ name: "test.throws" });
  hook.on(() => {
    throw new Error("boom");
  });

  await expectLater(() => hook.run("x"), throwsA(allOf(isA(Error), withMessage("boom"))));
});

Scribe.test("new Hook() refuses two hooks with the same name", () => {
  new Hook<string>({ name: "test.duplicate" });

  expect(() => new Hook<string>({ name: "test.duplicate" }), throwsA(isNotNull));
});

Scribe.test("the registry knows which hooks have no handler", () => {
  new Hook<string>({ name: "test.idle" });

  const report = hookRegistry.report();

  expect(report.includes("test.idle"), equals(true));
  expect(report.startsWith("[hooks]"), equals(true));
});

Scribe.test("background() does not run the handler within the request", async () => {
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

  expect(inlineRan, equals(true), "the inline handler ran within run()");
  expect(
    backgroundRan,
    equals(false),
    "the background handler was pushed rather than called, and the push failing on the " +
      "absent NATS did not hold run() back",
  );
});

Scribe.test("handlers() counts inline and background subscribers together", () => {
  const hook = new Hook<string>({ name: "test.background.count" });

  expect(hook.handlers(), equals(0));
  hook.on(() => {});
  expect(hook.handlers(), equals(1));
  hook.background(() => {});
  expect(hook.handlers(), equals(2));
});

Scribe.test("a hook nobody listens to answers without doing any work", () => {
  const hook = new Hook<string, string>({
    name: "test.unhandled",
    fallback: "no-op",
  });

  expect(
    hook.run("a"),
    same(hook.run("b")),
    "two emissions answered the same promise instance, so neither allocated anything",
  );
});

Scribe.test("a hook stops answering from the fast path once someone subscribes", async () => {
  const hook = new Hook<string, string>({
    name: "test.becomes-handled",
    fallback: "no-op",
  });
  const before = hook.run("a");

  hook.on(() => "handled");

  expect(before === hook.run("b"), same(false));
  expect(await hook.run("c"), equals("handled"));
});

Scribe.test("a synchronous chain is not made to wait on itself", async () => {
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

  expect(await hook.run("x"), equals("second"));
  expect(order, equals(["first:x", "second:x"]));
});
