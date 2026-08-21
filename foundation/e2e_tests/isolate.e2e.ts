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

import { E2E_TABLE, type E2eItem, report, requireStack, RUN_ID, STACK, timed, useStack } from "./support/stack.ts";
import { assert, assertEquals } from "@std/assert";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { Isolate } = await import("@scribe/foundation/src/isolate/mod.ts");
const { PostgrestClients } = await import("@scribe/foundation/src/database/client.ts");
const { from } = await import("@scribe/foundation/src/database/tables.ts");
const { Valkery } = await import("@scribe/foundation/src/valkery/mod.ts");
const { Time } = await import("@scribe/core/contracts/common/time.ts");

async function until(reached: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 2_000 && !reached(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function items() {
  return from<E2eItem>(PostgrestClients.service(), E2E_TABLE);
}

function labelled(label: string) {
  return items().select((s) => ({ label: s.label, weight: s.weight })).where((f) => f.label.eq(label));
}

function forget(label: string) {
  return items().where((f) => f.label.eq(label)).delete();
}

Deno.test("isolate: the caller runs on while the body is still reaching Postgres", async () => {
  const label = `e2e-detached-${RUN_ID}`;
  let inserted = false;

  const [, ms] = await timed(() => {
    Isolate.run(async () => {
      await items().insertOne({ label, weight: 1 });
      inserted = true;
    });
    return Promise.resolve();
  });
  report("what the caller pays for detaching", `${ms.toFixed(2)} ms`);

  assertEquals(inserted, false, "the insert must not have happened on the caller's path");

  await until(() => inserted);
  assertEquals(inserted, true, "the body should have run once the caller was out of the way");
  assertEquals((await labelled(label).getOne())?.weight, 1, "the body should have finished its write");
  await forget(label);
});

Deno.test("isolate: ten bodies finish their writes although nobody waits for any of them", async () => {
  const label = `e2e-many-${RUN_ID}`;
  let written = 0;

  for (let weight = 1; weight <= 10; weight++) {
    Isolate.run(async () => {
      await items().insertOne({ label, weight });
      written++;
    });
  }

  assertEquals(written, 0, "not one of the ten reached Postgres before the caller moved on");

  await until(() => written === 10);
  assertEquals(written, 10, "all ten bodies should have run to the end");
  assertEquals((await labelled(label).get()).length, 10, "every row should have landed in Postgres");
  await forget(label);
});

Deno.test("isolate: a body reaches Redis after the caller is long gone", async () => {
  const store = new Valkery<{ n: number }>({ key: `e2e:isolate:${RUN_ID}`, ttl: Time.seconds(30) });
  await store.clear();
  let cached = false;

  Isolate.run(async () => {
    await store.add("written-later", { n: 7 });
    cached = true;
  });

  assertEquals(cached, false, "nothing has reached Redis on the caller's path");

  await until(() => cached);
  assertEquals(cached, true, "the body should have run once the caller was out of the way");
  assertEquals(await store.get("written-later"), { n: 7 });
  await store.clear();
});

Deno.test("isolate: a body a real service refuses is logged, and the caller never hears of it", async () => {
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);

  Isolate.run(async () => {
    await from<E2eItem>(PostgrestClients.service(), `e2e_no_such_table_${RUN_ID}`)
      .select((s) => ({ label: s.label }))
      .get();
  });
  await until(() => logged.length > 0);
  console.error = original;

  assertEquals(logged.length, 1, "PostgREST refusing the read should be reported once");
  assert(
    String(logged[0][0]).includes("[isolate] detached body failed"),
    `the refusal should be reported as a detached body failing, got: ${String(logged[0][0])}`,
  );
});
