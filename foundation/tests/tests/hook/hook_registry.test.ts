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
import { equals, expect, isA, isNull, Scribe, throwsA } from "@scribe/alchemy/test";
import { installDrivers } from "../../testing/drivers.ts";
import { HookRegistry } from "../../../lib/src/hook/hook_registry.ts";
import type { RegisteredHook } from "../../../lib/src/hook/hook_registry.ts";

installDrivers();

function registered(name: string, handlerCount: number): RegisteredHook {
  return {
    name,
    handlers: () => handlerCount,
    run: () => Promise.resolve(undefined),
  };
}

Scribe.test("get() answers null for a name nothing declared", () => {
  const registry = new HookRegistry();

  expect(registry.get("nothing.here"), isNull);
});

Scribe.test("get() answers the hook registered under a name", () => {
  const registry = new HookRegistry();
  const hook = registered("some.event", 0);

  registry.add(hook);

  expect(registry.get("some.event"), equals(hook));
});

Scribe.test("list() answers every registered hook", () => {
  const registry = new HookRegistry();
  const first = registered("first.event", 0);
  const second = registered("second.event", 0);

  registry.add(first);
  registry.add(second);

  const names = registry.list().map((h) => h.name).sort();
  expect(names, equals(["first.event", "second.event"]));
});

Scribe.test("list() answers an empty list for a registry nothing was added to", () => {
  const registry = new HookRegistry();

  expect(registry.list(), equals([]));
});

Scribe.test("add() refuses a second, different hook under a name already taken", () => {
  const registry = new HookRegistry();
  registry.add(registered("clash.event", 0));

  expect(() => registry.add(registered("clash.event", 0)), throwsA(isA(Error)));
});

Scribe.test("add() accepts the exact same hook registered a second time", () => {
  const registry = new HookRegistry();
  const hook = registered("idempotent.event", 0);

  registry.add(hook);
  registry.add(hook);

  expect(registry.list().length, equals(1));
});

Scribe.test("report() names every idle hook and counts the handled ones apart", () => {
  const registry = new HookRegistry();
  registry.add(registered("idle.one", 0));
  registry.add(registered("idle.two", 0));
  registry.add(registered("handled.one", 3));

  const report = registry.report();

  expect(report.startsWith("[hooks] 3 declared"), equals(true));
  expect(report.includes("1 with a handler"), equals(true));
  expect(report.includes("idle.one"), equals(true));
  expect(report.includes("idle.two"), equals(true));
  expect(report.includes("handled.one"), equals(false), "a hook with a handler is not named among the idle ones");
});

Scribe.test("report() names no idle hook when every declared hook is handled", () => {
  const registry = new HookRegistry();
  registry.add(registered("busy.one", 1));
  registry.add(registered("busy.two", 2));

  const report = registry.report();

  expect(report.includes("without a handler"), equals(false));
  expect(report, equals("[hooks] 2 declared · 2 with a handler"));
});

Scribe.test("report() on an empty registry says so plainly", () => {
  const registry = new HookRegistry();

  expect(registry.report(), equals("[hooks] 0 declared · 0 with a handler"));
});
