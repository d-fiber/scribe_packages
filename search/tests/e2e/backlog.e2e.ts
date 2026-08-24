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

import { assert, assertEquals } from "@std/assert";
import { report, requireStack, useStack } from "./support/stack.ts";

await requireStack();
await useStack();

const { drainSearchOutbox } = await import("@scribe/search/lib/search.ts");
const { backlog, enqueue } = await import("@scribe/search/lib/src/db/outbox.ts");
const { searchOutbox } = await import("@scribe/search/lib/src/db/tables.ts");
const { remove } = await import("./support/rows.ts");
const { SearchOperation } = await import("@scribe/search/lib/contracts/definition.ts");

const ORPHAN = "e2e_unclaimed";
const MAX_ATTEMPTS = 5;

await remove("__search_outbox__", `index=eq.${ORPHAN}`);

Deno.test("search e2e: a document no declaration answers for stops being retried, and says why", async () => {
  assert(await enqueue(ORPHAN, ["ghost"], SearchOperation.Index), "the line refused the document");

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await drainSearchOutbox();
  }

  const row = await searchOutbox().where((f) => f.entity_id.eq("ghost")).getOne();

  assertEquals(row?.attempts, MAX_ATTEMPTS);
  assert(row?.failed_at !== null, "the document is still being claimed after it ran out of attempts");
  assert(
    row?.last_error?.includes(ORPHAN),
    `the reason kept on the row does not name the index: ${row?.last_error}`,
  );

  const waiting = await backlog(ORPHAN);

  assertEquals(waiting?.pending, 0);
  assertEquals(waiting?.failed, 1, "a document that gave up is still counted as waiting");
  report("gave up after", `${MAX_ATTEMPTS} attempts`);
});

Deno.test("search e2e: a line that holds nothing drains without reaching the cluster", async () => {
  await remove("__search_outbox__", `index=eq.${ORPHAN}`);

  assertEquals(await drainSearchOutbox(), 0, "an empty line drained something");
});
