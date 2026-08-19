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
import {
  clusterHas,
  clusterMapping,
  dropIndex,
  refresh,
  report,
  requireStack,
  timed,
  useStack,
} from "./support/stack.ts";

await requireStack();
await useStack();

const { stores } = await import("./support/catalog.ts");
const { insert, remove, resetIndex, update } = await import("./support/rows.ts");
const { drainSearchOutbox, syncDeclaredIndices } = await import("@scribe/search/mod.ts");
const { backlog } = await import("@scribe/search/src/db/outbox.ts");
const { searchIndices, searchOutbox, searchSources } = await import("@scribe/search/src/db/tables.ts");

interface Identified {
  store_id: string;
}

interface Branded {
  brand_id: string;
}

await dropIndex("e2e_stores");
await resetIndex("e2e_stores");

const [brand] = await insert<Branded>("e2e_brands", [{ label: "Rosa Coffee" }]);
let rosa = "";
let lino = "";

Deno.test("search e2e: syncing the declaration creates the index and records what it was told", async () => {
  const [, took] = await timed(() => syncDeclaredIndices());

  assert(await clusterHas("e2e_stores"), "the index was not created in the cluster");

  const mapping = await clusterMapping("e2e_stores");
  const properties = mapping.properties as Record<string, { type?: string }>;

  assertEquals(properties.name?.type, "text", "the name did not land as analysed text");
  assertEquals(properties.status?.type, "keyword", "the status did not land as a keyword");
  assertEquals(properties.tags?.type, "nested", "the tags were flattened into the document");

  const recorded = await searchIndices().where((f) => f.name.eq("e2e_stores")).getOne();

  assertEquals(recorded?.source_table, "e2e_stores");
  assertEquals(recorded?.source_key, "store_id");

  const sources = await searchSources().where((f) => f.index.eq("e2e_stores")).get();
  const tags = sources.find((source) => source.source_table === "e2e_store_tags");

  assertEquals(tags?.source_key, "store_id", "a tag row cannot name the store it belongs to");
  report("index created and recorded", `${Math.round(took)} ms`);
});

Deno.test("search e2e: a row written to the table lines up in the outbox", async () => {
  const [store] = await insert<Identified>("e2e_stores", [
    { name: "Chez Rosa", status: "open", rank: 30, is_open: true, brand_id: brand.brand_id },
  ]);
  rosa = store.store_id;

  const queued = await searchOutbox().where((f) => f.entity_id.eq(rosa)).getOne();

  assertEquals(queued?.index, "e2e_stores");
  assertEquals(queued?.operation, "index");
  assertEquals(queued?.attempts, 0);

  const waiting = await backlog("e2e_stores");
  assertEquals(waiting?.pending, 1, "the line does not hold the store the trigger queued");
});

Deno.test("search e2e: the drain writes the outbox into the cluster, folded relation included", async () => {
  const [drained, took] = await timed(() => drainSearchOutbox());
  assertEquals(drained, 1, "the drain did not take the store out of the line");

  await refresh("e2e_stores");
  const answered = await stores.search({ text: "rosa" });

  assert(answered.ok, "the cluster did not answer the search");
  assertEquals(answered.data.items.length, 1);
  assertEquals(answered.data.items[0].name, "Chez Rosa");
  assertEquals(answered.data.items[0].brand?.label, "Rosa Coffee", "the brand was not folded in");

  const waiting = await backlog("e2e_stores");
  assertEquals(waiting?.pending, 0, "the line still holds a document the cluster took");
  assertEquals(waiting?.failed, 0);

  report("drained and searchable", `${Math.round(took)} ms for one document`);
});

Deno.test("search e2e: a tag written on the far table rebuilds the store it names", async () => {
  await insert("e2e_store_tags", [{ store_id: rosa, tag: "roastery" }]);

  const queued = await searchOutbox().where((f) => f.entity_id.eq(rosa)).getOne();
  assertEquals(queued?.operation, "index", "a tag change queued something other than a rebuild");

  await drainSearchOutbox();
  await refresh("e2e_stores");

  const answered = await stores.search({ tag: "roastery" });

  assert(answered.ok, "the cluster did not answer the nested clause");
  assertEquals(answered.data.items.length, 1);
  assertEquals(answered.data.items[0].store_id, rosa);
});

Deno.test("search e2e: a page is narrowed and ranked by what the declaration named", async () => {
  const written = await insert<Identified>("e2e_stores", [
    { name: "Chez Lino", status: "open", rank: 50, is_open: true, brand_id: brand.brand_id },
    { name: "Chez Ada", status: "closed", rank: 90, is_open: false, brand_id: brand.brand_id },
  ]);
  lino = written[0].store_id;

  await drainSearchOutbox();
  await refresh("e2e_stores");

  const open = await stores.search({ open: true, sort: "rank" });

  assert(open.ok, "the cluster did not answer the filtered page");
  assertEquals(open.data.items.map((item) => item.name), ["Chez Lino", "Chez Rosa"]);
  assertEquals(open.data.pagination.total, 2, "a closed store was counted in an open page");

  const byName = await stores.search({ sort: "name" });

  assert(byName.ok);
  assertEquals(byName.data.items.map((item) => item.name), ["Chez Ada", "Chez Lino", "Chez Rosa"]);
  report("page over three documents", `${byName.data.pagination.total} matched`);
});

Deno.test("search e2e: a row that changes is rebuilt, and one that is deleted leaves the index", async () => {
  await update("e2e_stores", `store_id=eq.${lino}`, { name: "Chez Lino et Fils" });
  await drainSearchOutbox();
  await refresh("e2e_stores");

  const renamed = await stores.search({ text: "fils" });

  assert(renamed.ok);
  assertEquals(renamed.data.items[0]?.name, "Chez Lino et Fils", "the rename never reached the cluster");

  await remove("e2e_stores", `store_id=eq.${lino}`);

  const queued = await searchOutbox().where((f) => f.entity_id.eq(lino)).getOne();
  assertEquals(queued?.operation, "delete", "the deleted row was queued for a rebuild");

  await drainSearchOutbox();
  await refresh("e2e_stores");

  const gone = await stores.search({ text: "fils" });

  assert(gone.ok);
  assertEquals(gone.data.items.length, 0, "the document outlived the row it was built from");
});
