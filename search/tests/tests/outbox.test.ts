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
import { installValkeryMock } from "@scribe/foundation/testing";
import type { SearchParams } from "../../lib/contracts/definition.ts";
import { backlog, drainSearchOutbox, Field, Search } from "@scribe/search";
import { installSearchMock } from "../testing/mock.ts";
import { installDatabaseFake } from "./mocks/database.ts";

interface StoreRow {
  store_id: string;
  name: string;
}

interface StoreSearch extends SearchParams {
  text?: string;
}

installDatabaseFake({
  merged_stores: [{ store_id: "a", name: "Chez Rosa" }],
  drained_stores: [
    { store_id: "a", name: "Chez Rosa" },
    { store_id: "b", name: "Chez Lino" },
  ],
  partial_stores: [
    { store_id: "a", name: "Chez Rosa" },
    { store_id: "b", name: "Chez Lino" },
    { store_id: "c", name: "Chez Ada" },
  ],
});

function declare(table: string) {
  return Search.on<StoreRow>(table, "store_id")
    .document((s) => ({ name: Field.text(s.name) }))
    .preview((s) => ({ id: s.store_id }))
    .query((params: StoreSearch, { q }) => q.text(params.text));
}

const mergedStores = declare("merged_stores");
const drainedStores = declare("drained_stores");
const partialStores = declare("partial_stores");

function harness() {
  const valkery = installValkeryMock();
  const transport = installSearchMock();

  return {
    transport,
    async restore(): Promise<void> {
      await drainSearchOutbox();
      transport.restore();
      valkery.restore();
    },
  };
}

Scribe.test("queuing the same document twice before a drain leaves one pending row", async () => {
  const { restore } = harness();

  try {
    await mergedStores.add("a");
    await mergedStores.add("a");

    expect(await backlog("merged_stores"), equals({ pending: 1, failed: 0 }));
  } finally {
    await restore();
  }
});

Scribe.test("draining writes every queued document and empties the outbox", async () => {
  const { restore } = harness();

  try {
    await drainedStores.addMany(["a", "b"]);
    const drained = await drainSearchOutbox();

    expect(drained, equals(2));
    expect(await backlog("drained_stores"), equals({ pending: 0, failed: 0 }));
  } finally {
    await restore();
  }
});

Scribe.test("one document the cluster refuses does not hold back the rest of its batch", async () => {
  const { transport, restore } = harness();

  try {
    transport.refuseIds(["b"]);
    await partialStores.addMany(["a", "b", "c"]);
    await drainSearchOutbox();

    expect(transport.held("partial_stores").length, equals(2));
    expect(await backlog("partial_stores"), equals({ pending: 1, failed: 0 }));
  } finally {
    await restore();
  }
});
