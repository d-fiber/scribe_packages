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

import { assertEquals } from "@std/assert";
import { installSearchMock } from "@scribe/search/testing/mock.ts";
import { searchTransport } from "@scribe/search/src/transport/registry.ts";
import { SearchTransports } from "@scribe/search/mod.ts";

Deno.test("installing the mock replaces the transport, and restoring puts the previous one back", () => {
  const before = searchTransport();
  const recording = installSearchMock();

  assertEquals(searchTransport(), recording);
  recording.restore();
  assertEquals(searchTransport(), before);
});

Deno.test("what an index writes is held per index, and read back in the order it was written", async () => {
  const recording = installSearchMock();

  try {
    await recording.index("stores", [
      { id: "a", source: { name: "Chez Rosa" } },
      { id: "b", source: { name: "Chez Lino" } },
    ]);

    assertEquals(recording.held("stores"), [{ name: "Chez Rosa" }, { name: "Chez Lino" }]);
    assertEquals(recording.held("brands"), []);
  } finally {
    recording.restore();
  }
});

Deno.test("a document written twice under one identifier is held once, with the last shape", async () => {
  const recording = installSearchMock();

  try {
    await recording.index("stores", [{ id: "a", source: { name: "Chez Rosa" } }]);
    await recording.index("stores", [{ id: "a", source: { name: "Chez Ada" } }]);

    assertEquals(recording.held("stores"), [{ name: "Chez Ada" }]);
  } finally {
    recording.restore();
  }
});

Deno.test("removing answers how many identifiers were actually held", async () => {
  const recording = installSearchMock();

  try {
    await recording.index("stores", [{ id: "a", source: {} }]);

    assertEquals(await recording.remove("stores", ["a", "gone"]), 1);
    assertEquals(recording.held("stores"), []);
  } finally {
    recording.restore();
  }
});

Deno.test("the configuration an index was last asked to match is kept under its name", async () => {
  const recording = installSearchMock();

  try {
    await recording.ensure("stores", { mappings: { properties: { name: { type: "text" } } } });

    assertEquals(recording.ensured.get("stores")?.mappings.properties, { name: { type: "text" } });
  } finally {
    recording.restore();
  }
});

Deno.test("a mock that was told to answer nothing is how an unreachable cluster is exercised", async () => {
  const recording = installSearchMock();

  try {
    recording.answerNothing();

    assertEquals(
      await recording.search({ index: "stores", plan: { bool: {}, sort: [] }, key: "id", from: 0, size: 10 }),
      null,
    );
  } finally {
    recording.restore();
  }
});

Deno.test("restoring twice leaves no transport behind, since the first put the previous one back", () => {
  const first = installSearchMock();
  const second = installSearchMock();

  second.restore();
  assertEquals(searchTransport(), first);

  first.restore();
  SearchTransports.use(null);
});
