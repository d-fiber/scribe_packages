// Copyright (C) 2026 Fiber
//
// This file is part of scribe and is made available under the PolyForm Shield
// License 1.0.0. The full terms are in the LICENSE file at the root of this
// repository, and at https://polyformproject.org/licenses/shield/1.0.0
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
//
// The one thing you may not do:
// - Use it to provide any product that competes with scribe, or with any
//   product Fiber or its affiliates provide using scribe. Products compete
//   even when they are offered free of charge, through a different kind of
//   interface, or for a different technical platform.
//
// If you pass this software on:
// - Anyone who receives any part of it from you must also receive these terms,
//   or the URL above, together with the "Required Notice" line carried by the
//   LICENSE file.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE COMES AS IS, WITHOUT ANY WARRANTY OR
// CONDITION, AND THE LICENSOR WILL NOT BE LIABLE TO YOU FOR ANY DAMAGES ARISING
// OUT OF THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY KIND OF
// LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

import { assert, assertEquals } from "@std/assert";
import { report, requireStack, useStack } from "./support/stack.ts";

await requireStack();
await useStack();

const { drainSearchOutbox } = await import("@scribe/search/mod.ts");
const { backlog, enqueue } = await import("@scribe/search/src/db/outbox.ts");
const { searchOutbox } = await import("@scribe/search/src/db/tables.ts");
const { remove } = await import("./support/rows.ts");
const { SearchOperation } = await import("@scribe/search/contracts/definition.ts");

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
