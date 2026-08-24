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

import { assertEquals } from "@std/assert";
import { installValkeryMock } from "@scribe/foundation/tests/testing/valkery.ts";
import type { SearchParams } from "@scribe/search/lib/contracts/definition.ts";
import { installSearchMock } from "@scribe/search/tests/testing/mock.ts";
import { Field, Search } from "@scribe/search/lib/search.ts";
import { installDatabaseFake } from "./mocks/database.ts";

interface StoreRow {
  store_id: string;
  name: string;
  status: string;
}

interface StoreSearch extends SearchParams {
  text?: string;
}

const ROWS: Record<string, unknown>[] = [
  { store_id: "a", name: "Chez Rosa", status: "open" },
  { store_id: "b", name: "Chez Lino", status: "open" },
  { store_id: "c", name: "Chez Ada", status: "closed" },
];

const stores = Search.on<StoreRow>("answer_stores", "store_id", { pageSize: 2 })
  .document((s) => ({ name: Field.text(s.name), status: Field.keyword(s.status) }))
  .preview((s) => ({ store_id: s.store_id, name: s.name }))
  .query((params: StoreSearch, { q }) => q.text(params.text));

function harness() {
  const database = installDatabaseFake({ answer_stores: [...ROWS] });
  const valkery = installValkeryMock();
  const transport = installSearchMock();

  return {
    transport,
    restore(): void {
      transport.restore();
      valkery.restore();
      database.restore();
    },
  };
}

Deno.test("a search asks the cluster for the declared index, with the plan it compiled", async () => {
  const { transport, restore } = harness();

  try {
    transport.answer(["a"]);
    await stores.search({ text: "rosa" });

    assertEquals(transport.lastRequest?.index, "answer_stores");
    assertEquals(transport.lastRequest?.key, "store_id");
    assertEquals(transport.lastRequest?.plan, stores.plan({ text: "rosa" }));
  } finally {
    restore();
  }
});

Deno.test("a caller asking for no size gets the page size the declaration named", async () => {
  const { transport, restore } = harness();

  try {
    transport.answer([]);
    await stores.search({});
    assertEquals(transport.lastRequest?.size, 2);

    await stores.search({ page: { size: 50, from: 10 } });
    assertEquals(transport.lastRequest?.size, 50);
    assertEquals(transport.lastRequest?.from, 10);
  } finally {
    restore();
  }
});

Deno.test("the previews answered are the rows the cluster ranked, in the order it ranked them", async () => {
  const { transport, restore } = harness();

  try {
    transport.answer(["b", "a"]);
    const answered = await stores.search({});

    assertEquals(answered.ok, true);
    assertEquals(answered.ok && answered.data.items, [
      { store_id: "b", name: "Chez Lino" },
      { store_id: "a", name: "Chez Rosa" },
    ]);
  } finally {
    restore();
  }
});

Deno.test("a page that does not reach the total says there is more to read", async () => {
  const { transport, restore } = harness();

  try {
    transport.answer(["a", "b"]);
    const answered = await stores.search({});

    assertEquals(answered.ok && answered.data.offset, 2);
    assertEquals(answered.ok && answered.data.hasMore, false);
  } finally {
    restore();
  }
});

Deno.test("a cluster that answers nothing yields a failure rather than an empty page", async () => {
  const { transport, restore } = harness();

  try {
    transport.answerNothing();
    const answered = await stores.search({ text: "unreachable" });

    assertEquals(answered.ok, false);
  } finally {
    restore();
  }
});

Deno.test("an index queued for a rebuild writes it into the outbox, never into the cluster", async () => {
  const { transport, restore } = harness();

  try {
    await stores.add("a");

    assertEquals(transport.held("answer_stores"), []);
  } finally {
    restore();
  }
});
