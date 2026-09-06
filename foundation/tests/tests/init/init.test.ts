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
import { Init } from "../../../lib/src/lifecycle/init/init.ts";
import { initRegistry } from "../../../lib/src/lifecycle/init/init_registry.ts";
import { runDeclaredInits } from "../../../lib/src/lifecycle/init/init_runner.ts";
import { installInitDatabaseFake } from "./mocks/database.ts";

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

Scribe.test("@Lifecycle() building the class registers its @Init() method under the class name", () => {
  @Lifecycle()
  class TestInitDefineBasic {
    @Init()
    async run(): Future<void> {}
  }
  void TestInitDefineBasic;

  expect(initRegistry.list().some((entry) => entry.name === "TestInitDefineBasic"), equals(true));
});

Scribe.test("@Init() refuses a static method", () => {
  expect(() => {
    @Lifecycle()
    class TestInitDefineStatic {
      @Init()
      static run(): Future<void> {
        return Promise.resolve();
      }
    }
    void TestInitDefineStatic;
  }, throwsA(isNotNull));
});

Scribe.test("a class carries at most one @Init(), a second one on the same class is refused", () => {
  expect(() => {
    @Lifecycle()
    class TestInitDefineDuplicate {
      @Init()
      async first(): Future<void> {}

      @Init()
      async second(): Future<void> {}
    }
    void TestInitDefineDuplicate;
  }, throwsA(isNotNull));
});

Scribe.test("a method runs bound to its own instance, and may read its own state", async () => {
  let seen = false;

  @Lifecycle()
  class TestInitRunBound {
    ran = false;

    @Init()
    async run(): Future<void> {
      this.ran = true;
      seen = this.ran;
    }
  }
  void TestInitRunBound;

  const db = installInitDatabaseFake();
  try {
    await runDeclaredInits();

    expect(seen, equals(true));
  } finally {
    db.restore();
  }
});

Scribe.test("the registry lists declared jobs", () => {
  @Lifecycle()
  class TestInitDefineReported {
    @Init()
    async run(): Future<void> {}
  }
  void TestInitDefineReported;

  const report = initRegistry.report();

  expect(report, contains("[init]"));
  expect(report, contains("TestInitDefineReported"));
});

Scribe.test("runDeclaredInits() runs a job that has never run before, then tracks it", async () => {
  let calls = 0;

  @Lifecycle()
  class TestInitRunOnce {
    @Init()
    async run(): Future<void> {
      calls++;
    }
  }
  void TestInitRunOnce;

  const db = installInitDatabaseFake();
  try {
    await runDeclaredInits();

    expect(calls, equals(1));
    expect(db.rows("__inits__").some((row) => row.name === "TestInitRunOnce"), equals(true));
  } finally {
    db.restore();
  }
});

Scribe.test("runDeclaredInits() skips a job already tracked", async () => {
  let calls = 0;

  @Lifecycle()
  class TestInitRunSkip {
    @Init()
    async run(): Future<void> {
      calls++;
    }
  }
  void TestInitRunSkip;

  const db = installInitDatabaseFake({
    __inits__: [{ name: "TestInitRunSkip", ran_at: "2026-01-01T00:00:00Z" }],
  });
  try {
    await runDeclaredInits();

    expect(calls, equals(0));
  } finally {
    db.restore();
  }
});

Scribe.test("runDeclaredInits() stops at the first failure without tracking it or running what is behind it", async () => {
  let ranAfter = false;

  @Lifecycle()
  class TestInitRunFails {
    @Init()
    async run(): Future<void> {
      throw new Error("boom");
    }
  }
  @Lifecycle()
  class TestInitRunZzzAfter {
    @Init()
    async run(): Future<void> {
      ranAfter = true;
    }
  }
  void TestInitRunFails;
  void TestInitRunZzzAfter;

  const db = installInitDatabaseFake();
  try {
    expect(await caughtAsync(() => runDeclaredInits()), isNotNull);

    expect(ranAfter, equals(false));
    expect(db.rows("__inits__").some((row) => row.name === "TestInitRunFails"), equals(false));
  } finally {
    db.restore();
  }
});
