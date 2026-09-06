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
import { contains, equals, expect, fail, isNotNull, Scribe, throwsA } from "@scribe/alchemy/test";
import type { Future } from "@scribe/alchemy";
import { installDrivers } from "../../testing/drivers.ts";
import { Lifecycle } from "../../../lib/src/lifecycle/lifecycle.ts";
import { Run } from "../../../lib/src/lifecycle/run/run.ts";
import { runRegistry } from "../../../lib/src/lifecycle/run/run_registry.ts";
import { runDeclaredRuns } from "../../../lib/src/lifecycle/run/run_runner.ts";

installDrivers();

/** Calls `body`, and answers what it raised. */
async function caughtAsync(body: () => Future<void>): Future<unknown> {
  try {
    await body();
  } catch (raised) {
    return raised;
  }
  fail("it returned instead of raising");
}

Scribe.test("@Lifecycle() building the class registers its @Run() method under the class name", () => {
  @Lifecycle()
  class TestRunDefineBasic {
    @Run()
    async run(): Future<void> {}
  }
  void TestRunDefineBasic;

  expect(runRegistry.list().some((entry) => entry.name === "TestRunDefineBasic"), equals(true));
});

Scribe.test("@Run() refuses a static method", () => {
  expect(() => {
    @Lifecycle()
    class TestRunDefineStatic {
      @Run()
      static run(): Future<void> {
        return Promise.resolve();
      }
    }
    void TestRunDefineStatic;
  }, throwsA(isNotNull));
});

Scribe.test("a class carries at most one @Run(), a second one on the same class is refused", () => {
  expect(() => {
    @Lifecycle()
    class TestRunDefineDuplicate {
      @Run()
      async first(): Future<void> {}

      @Run()
      async second(): Future<void> {}
    }
    void TestRunDefineDuplicate;
  }, throwsA(isNotNull));
});

Scribe.test("the registry lists declared jobs", () => {
  @Lifecycle()
  class TestRunDefineReported {
    @Run()
    async run(): Future<void> {}
  }
  void TestRunDefineReported;

  const report = runRegistry.report();

  expect(report, contains("[run]"));
  expect(report, contains("TestRunDefineReported"));
});

Scribe.test("runDeclaredRuns() plays a declared job", async () => {
  let calls = 0;

  @Lifecycle()
  class TestRunPlaysOnce {
    @Run()
    async run(): Future<void> {
      calls++;
    }
  }
  void TestRunPlaysOnce;

  await runDeclaredRuns();

  expect(calls, equals(1));
});

Scribe.test("runDeclaredRuns() plays the same job again on a second call, unlike an init job", async () => {
  let calls = 0;

  @Lifecycle()
  class TestRunPlaysEveryTime {
    @Run()
    async run(): Future<void> {
      calls++;
    }
  }
  void TestRunPlaysEveryTime;

  await runDeclaredRuns();
  await runDeclaredRuns();

  expect(calls, equals(2));
});

Scribe.test("runDeclaredRuns() stops at the first failure without running what is behind it", async () => {
  let ranAfter = false;

  @Lifecycle()
  class TestRunFails {
    @Run()
    async run(): Future<void> {
      throw new Error("boom");
    }
  }
  @Lifecycle()
  class TestRunZzzAfter {
    @Run()
    async run(): Future<void> {
      ranAfter = true;
    }
  }
  void TestRunFails;
  void TestRunZzzAfter;

  expect(await caughtAsync(() => runDeclaredRuns()), isNotNull);

  expect(ranAfter, equals(false));
});
