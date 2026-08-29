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
import "@scribe/testing/runner.ts";
import { equals, expect, Scribe } from "@scribe/alchemy/test";
import { installSearchMock } from "../testing/mock.ts";
import { searchTransport } from "../../lib/src/transport/registry.ts";
import { SearchTransports } from "@scribe/search";

Scribe.test("installing the mock replaces the transport, and restoring puts the previous one back", () => {
  const before = searchTransport();
  const recording = installSearchMock();

  expect(searchTransport(), equals(recording));
  recording.restore();
  expect(searchTransport(), equals(before));
});

Scribe.test("what an index writes is held per index, and read back in the order it was written", async () => {
  const recording = installSearchMock();

  try {
    await recording.index("stores", [
      { id: "a", source: { name: "Chez Rosa" } },
      { id: "b", source: { name: "Chez Lino" } },
    ]);

    expect(recording.held("stores"), equals([{ name: "Chez Rosa" }, { name: "Chez Lino" }]));
    expect(recording.held("brands"), equals([]));
  } finally {
    recording.restore();
  }
});

Scribe.test("a document written twice under one identifier is held once, with the last shape", async () => {
  const recording = installSearchMock();

  try {
    await recording.index("stores", [{ id: "a", source: { name: "Chez Rosa" } }]);
    await recording.index("stores", [{ id: "a", source: { name: "Chez Ada" } }]);

    expect(recording.held("stores"), equals([{ name: "Chez Ada" }]));
  } finally {
    recording.restore();
  }
});

Scribe.test("removing answers how many identifiers were actually held", async () => {
  const recording = installSearchMock();

  try {
    await recording.index("stores", [{ id: "a", source: {} }]);

    expect(await recording.remove("stores", ["a", "gone"]), equals(1));
    expect(recording.held("stores"), equals([]));
  } finally {
    recording.restore();
  }
});

Scribe.test("the configuration an index was last asked to match is kept under its name", async () => {
  const recording = installSearchMock();

  try {
    await recording.ensure("stores", { mappings: { properties: { name: { type: "text" } } } });

    expect(recording.ensured.get("stores")?.mappings.properties, equals({ name: { type: "text" } }));
  } finally {
    recording.restore();
  }
});

Scribe.test("a mock that was told to answer nothing is how an unreachable cluster is exercised", async () => {
  const recording = installSearchMock();

  try {
    recording.answerNothing();

    expect(
      await recording.search({ index: "stores", plan: { bool: {}, sort: [] }, key: "id", from: 0, size: 10 }),
      equals(null),
    );
  } finally {
    recording.restore();
  }
});

Scribe.test("restoring twice leaves no transport behind, since the first put the previous one back", () => {
  const first = installSearchMock();
  const second = installSearchMock();

  second.restore();
  expect(searchTransport(), equals(first));

  first.restore();
  SearchTransports.use(null);
});
