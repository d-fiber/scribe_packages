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

import { installDrivers } from "@scribe/foundation/tests/testing/drivers.ts";
import { Queue } from "@scribe/foundation/lib/src/queue/queue.ts";
import { queueRegistry } from "@scribe/foundation/lib/src/queue/queue_registry.ts";
import { deadSubjectOf, sanitize, subjectOf } from "@scribe/foundation/lib/src/queue/queue_naming.ts";
import { dispatchProbes, probe } from "./probe.ts";
import { DuplicateDeclarationError } from "@scribe/alchemy";
import { assertEquals, assertNotEquals, assertThrows } from "@std/assert";

installDrivers();

Deno.test("sanitize folds two different names onto one subject token", () => {
  assertEquals(sanitize("test:collide.one"), sanitize("test:collide_one"));
  assertEquals(subjectOf("mail.send", false), subjectOf("mail send", false));
  assertEquals(deadSubjectOf("mail.send"), deadSubjectOf("mail/send"));
});

Deno.test({
  name: "two names that fold onto the same subject are both accepted, and the second steals the first",
  fn: () => {
    const first: string[] = [];
    const second: string[] = [];
    assertEquals(first, []);

    new Queue<{ id: string }>({ name: "test:collide.subject" }, (job) => {
      first.push(job.id);
      return Promise.resolve();
    });

    assertThrows(
      () =>
        new Queue<{ id: string }>({ name: "test:collide_subject" }, (job) => {
          second.push(job.id);
          return Promise.resolve();
        }),
      DuplicateDeclarationError,
      "subject",
      "the second declaration takes a subject the first already publishes to, which the "
        + "duplicate guard does not see because it only indexes by name",
    );
  },
});

Deno.test({
  name: "a message pushed by the first queue is handed to the body of the one that stole its subject",
  fn: async () => {
    const first: string[] = [];
    const second: string[] = [];

    new Queue<{ id: string }>({ name: "test:steal.a" }, (job) => {
      first.push(job.id);
      return Promise.resolve();
    });
    assertThrows(() =>
      new Queue<{ id: string }>({ name: "test:steal_a" }, (job) => {
        second.push(job.id);
        return Promise.resolve();
      })
    );

    await dispatchProbes([probe({ subject: "q.test_steal_a", data: { id: "x" } })]);

    assertEquals(
      first,
      ["x"],
      "the registry answers the last declaration, so every message of the first queue runs "
        + "under a body that was never meant to see it",
    );
    assertEquals(second, []);
  },
});

Deno.test({
  name: "an empty queue name is accepted and builds a subject NATS refuses",
  fn: () => {
    assertThrows(
      () => new Queue<{ id: string }>({ name: "" }, () => Promise.resolve()),
      Error,
      "",
      'sanitize("") answers the empty string, so the subject is "q." and its second token is '
        + "empty, which the server rejects at publish time rather than at declaration time",
    );
  },
});

Deno.test("a name whose subject a dedicated queue would take stays on its own prefix", () => {
  new Queue<{ id: string }>({ name: "test:prefix:shared" }, () => Promise.resolve());
  new Queue<{ id: string }>(
    { name: "test:prefix:shared:iso", dedicated: true },
    () => Promise.resolve(),
  );

  assertEquals(queueRegistry.get("test:prefix:shared")?.subject, "q.test_prefix_shared");
  assertEquals(
    queueRegistry.get("test:prefix:shared:iso")?.subject,
    "qd.test_prefix_shared_iso",
  );
  assertNotEquals(
    queueRegistry.get("test:prefix:shared")?.subject,
    queueRegistry.get("test:prefix:shared:iso")?.subject,
  );
});

Deno.test("a subject that is a strict prefix of another is never confused with it", async () => {
  const outer: string[] = [];
  const inner: string[] = [];

  new Queue<{ id: string }>({ name: "test:pre" }, (job) => {
    outer.push(job.id);
    return Promise.resolve();
  });
  new Queue<{ id: string }>({ name: "test:pre:longer" }, (job) => {
    inner.push(job.id);
    return Promise.resolve();
  });

  await dispatchProbes([
    probe({ subject: "q.test_pre", data: { id: "short" }, seq: 1 }),
    probe({ subject: "q.test_pre_longer", data: { id: "long" }, seq: 2 }),
  ]);

  assertEquals(outer, ["short"]);
  assertEquals(inner, ["long"]);
});

Deno.test("a name of ten thousand characters keeps its own subject", () => {
  const long = "z".repeat(10_000);

  new Queue<{ id: string }>({ name: `test:long:${long}` }, () => Promise.resolve());

  assertEquals(queueRegistry.get(`test:long:${long}`)?.subject.length, 10_000 + 12);
});
