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

import { assertEquals, assertStringIncludes } from "@std/assert";
import { stub } from "@std/testing/mock";
import { Isolate } from "@scribe/foundation/src/isolate/mod.ts";

interface Gate {
  readonly opened: Promise<void>;
  open(): void;
}

function gate(): Gate {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

async function until(reached: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 500 && !reached(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

Deno.test("run() starts the body and returns before it has finished", async () => {
  const start = gate();
  let finished = false;

  Isolate.run(async () => {
    await start.opened;
    finished = true;
  });

  assertEquals(finished, false, "the body must not run on the caller's path");

  start.open();
  await until(() => finished);

  assertEquals(finished, true, "the body should have run to the end once it was let through");
});

Deno.test("the body carries on after the caller has answered and moved on", async () => {
  const answered = gate();
  const steps: string[] = [];

  const endpoint = () => {
    Isolate.run(async () => {
      steps.push("body started");
      await answered.opened;
      steps.push("body finished");
    });
    steps.push("endpoint answered");
    answered.open();
  };

  endpoint();
  await until(() => steps.length === 3);

  assertEquals(steps, ["body started", "endpoint answered", "body finished"]);
});

Deno.test("a body that throws is logged and never reaches the caller", async () => {
  const logged = stub(console, "error");

  Isolate.run(() => {
    throw new Error("the body gave up");
  });
  await until(() => logged.calls.length > 0);
  logged.restore();

  assertEquals(logged.calls.length, 1, "the failure should be reported exactly once");
  assertStringIncludes(
    String(logged.calls[0].args[0]),
    "[isolate] detached body failed",
    "the log line should say a detached body is what failed",
  );
  assertStringIncludes(String(logged.calls[0].args[1]), "the body gave up");
});

Deno.test("a body that rejects long after the caller is logged too", async () => {
  const logged = stub(console, "error");
  const start = gate();

  Isolate.run(async () => {
    await start.opened;
    throw new Error("the body gave up later");
  });

  assertEquals(logged.calls.length, 0, "nothing has failed while the body is still going");

  start.open();
  await until(() => logged.calls.length > 0);
  logged.restore();

  assertEquals(logged.calls.length, 1, "the rejection should be reported exactly once");
  assertStringIncludes(String(logged.calls[0].args[1]), "the body gave up later");
});
