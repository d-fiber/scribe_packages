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
import { equals, expect, Scribe } from "@scribe/alchemy/test";
import { installDrivers } from "../../testing/drivers.ts";
import type { Result } from "@scribe/alchemy";
import type { PostgrestClient } from "@supabase/postgrest-js";
import { from } from "../../../lib/src/database/tables_base.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

interface Answer {
  readonly data: unknown;
  readonly error: unknown;
}

const TABLE = "t__unowned_result";

function answering(answer: Answer): PostgrestClient {
  const chain: Any = new Proxy(function () {}, {
    get(_target, key: string | symbol) {
      if (key === "then") {
        return (resolve: (value: Answer) => unknown) => Promise.resolve(answer).then(resolve);
      }
      return () => chain;
    },
    apply: () => chain,
  });

  return { from: () => chain } as unknown as PostgrestClient;
}

function kindOf(outcome: Result<unknown>): string {
  return outcome.ok ? "ok" : outcome.error.kind;
}

function saidBy(outcome: Result<unknown>): string {
  return outcome.ok ? "" : outcome.error.message;
}

const WRITES: ReadonlyArray<[string, (client: PostgrestClient) => Promise<Result<unknown>>]> = [
  ["insert", (c) => from<{ id: string }>(c, TABLE).insert({ id: "a" })],
  ["insertOne", (c) => from<{ id: string }>(c, TABLE).insertOne({ id: "a" })],
  ["update", (c) => from<{ id: string }>(c, TABLE).where((f) => f.id.eq("a")).update({ id: "b" })],
  ["delete", (c) => from<{ id: string }>(c, TABLE).where((f) => f.id.eq("a")).delete()],
  ["deleteOne", (c) => from<{ id: string }>(c, TABLE).where((f) => f.id.eq("a")).deleteOne()],
];

installDrivers();

Scribe.test("a store that answered with a code is a conflict, on every one of the five writes", async () => {
  for (const [name, write] of WRITES) {
    const outcome = await write(answering({ data: null, error: { code: "23505", message: "duplicate key" } }));

    expect(kindOf(outcome), equals("conflict"), `${name} did not read the store's own refusal`);
    expect(saidBy(outcome), equals("duplicate key"), `${name} lost what the store said`);
  }
});

Scribe.test("a store that answered nothing at all is unavailable, on every one of the five writes", async () => {
  for (const [name, write] of WRITES) {
    const outcome = await write(answering({ data: null, error: new Error("connection reset") }));

    expect(kindOf(outcome), equals("unavailable"), `${name} called a reachability failure something else`);
  }
});

Scribe.test("a write that names no row is denied before the store is reached", async () => {
  const unbounded: ReadonlyArray<[string, (c: PostgrestClient) => Promise<Result<unknown>>]> = [
    ["update", (c) => from<{ id: string }>(c, TABLE).update({ id: "b" })],
    ["delete", (c) => from<{ id: string }>(c, TABLE).delete()],
    ["deleteOne", (c) => from<{ id: string }>(c, TABLE).deleteOne()],
  ];

  for (const [name, write] of unbounded) {
    const outcome = await write(answering({ data: [{ id: "a" }], error: null }));

    expect(kindOf(outcome), equals("denied"), `${name} reached the store with no bound`);
  }
});

Scribe.test("a one-row write that matched nothing is missing, not a failure of the store", async () => {
  expect(
    kindOf(await from<{ id: string }>(answering({ data: null, error: null }), TABLE).insertOne({ id: "a" })),
    equals("missing"),
  );
  expect(
    kindOf(
      await from<{ id: string }>(answering({ data: null, error: null }), TABLE)
        .where((f) => f.id.eq("a"))
        .deleteOne(),
    ),
    equals("missing"),
  );
});

Scribe.test("a many-row write that matched nothing succeeded with a count of zero", async () => {
  const removed = await from<{ id: string }>(answering({ data: [], error: null }), TABLE)
    .where((f) => f.id.eq("a"))
    .delete();

  expect(removed.ok, equals(true), "matching no row is not a refusal");
  expect(removed.ok === true && removed.data, equals(0));
});

Scribe.test("insert answers the number of rows it was handed, not what the store echoed", async () => {
  const one = await from<{ id: string }>(answering({ data: null, error: null }), TABLE).insert({ id: "a" });
  const three = await from<{ id: string }>(answering({ data: null, error: null }), TABLE)
    .insert([{ id: "a" }, { id: "b" }, { id: "c" }]);

  expect(one.ok === true && one.data, equals(1));
  expect(three.ok === true && three.data, equals(3));
});

Scribe.test("a store that answered a row count of its own is counted, not the payload it was sent", async () => {
  const written = await from<{ id: string }>(answering({ data: [{ id: "a" }, { id: "b" }], error: null }), TABLE)
    .where((f) => f.id.eq("a"))
    .update({ id: "b" });

  expect(written.ok === true && written.data, equals(2));
});

Scribe.test("DEFECT a store failure that is falsy reads as a write that happened", async () => {
  for (const [name, write] of WRITES) {
    const outcome = await write(answering({ data: null, error: "" }));

    expect(outcome.ok, equals(false), `${name} answered success on a store that reported a failure`);
  }
});

Scribe.test("DEFECT a store failure that is not an object is called retryable", async () => {
  for (const shape of ["duplicate key value violates unique constraint", 23505]) {
    const outcome = await from<{ id: string }>(answering({ data: null, error: shape }), TABLE).insert({ id: "a" });

    expect(
      kindOf(outcome),
      equals("conflict"),
      `a store that answered ${JSON.stringify(shape)} answered, so replaying the call cannot help`,
    );
  }
});

Scribe.test("DEFECT a store failure that is not an object loses what it said", async () => {
  const outcome = await from<{ id: string }>(
    answering({ data: null, error: "duplicate key value violates unique constraint" }),
    TABLE,
  ).insert({ id: "a" });

  expect(saidBy(outcome), equals("duplicate key value violates unique constraint"));
});

Scribe.test("DEFECT a many-row write the store answered nothing for is indistinguishable from one that matched nothing", async () => {
  const silent = await from<{ id: string }>(answering({ data: null, error: null }), TABLE)
    .where((f) => f.id.eq("a"))
    .update({ id: "b" });
  const matchedNothing = await from<{ id: string }>(answering({ data: [], error: null }), TABLE)
    .where((f) => f.id.eq("a"))
    .update({ id: "b" });

  expect(
    kindOf(silent) === kindOf(matchedNothing) && silent.ok === true && matchedNothing.ok === true &&
      silent.data === matchedNothing.data,
    equals(false),
    "a store that did not say what it wrote must not be reported as a store that wrote nothing",
  );
});

Scribe.test("a store failure carrying a code but nothing to say still says which kind it is", async () => {
  const outcome = await from<{ id: string }>(answering({ data: null, error: { code: "42501" } }), TABLE)
    .insert({ id: "a" });

  expect(kindOf(outcome), equals("conflict"));
  expect(saidBy(outcome), equals("the write did not happen."));
});

Scribe.test("a store failure carrying what it says but no code is left retryable", async () => {
  const outcome = await from<{ id: string }>(answering({ data: null, error: { message: "socket hang up" } }), TABLE)
    .insert({ id: "a" });

  expect(kindOf(outcome), equals("unavailable"), "no code means nothing on the far side answered");
  expect(saidBy(outcome), equals("socket hang up"));
});

Scribe.test("an insert of no rows at all is an honest count of zero", async () => {
  const outcome = await from<{ id: string }>(answering({ data: null, error: null }), TABLE).insert([]);

  expect(outcome.ok, equals(true));
  expect(outcome.ok === true && outcome.data, equals(0));
});
