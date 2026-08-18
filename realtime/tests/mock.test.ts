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

import { realtime } from "@scribe/realtime/mod.ts";
import { assertEquals, assertNotStrictEquals, assertStrictEquals } from "@std/assert";
import { createRealtimeMock, installRealtimeMock } from "@scribe/realtime/testing/mock.ts";

Deno.test(
  "realtime automock: unconfigured calls default to resolving true",
  async () => {
    const mock = createRealtimeMock();

    const ok = await mock.target.topics.admins.add("room", "a1");

    assertEquals(ok, true);
    assertEquals(mock.calls("topics.admins.add"), [["room", "a1"]]);
  },
);

Deno.test(
  "realtime automock: when() overrides the default for a specific path",
  async () => {
    const mock = createRealtimeMock();
    mock.when("topics.users.add", () => Promise.resolve(false));

    assertEquals(await mock.target.topics.users.add("room", "u1"), false);
  },
);

// Since `realtime` is an exported `const`, it is `topics` (its only surface)
// that gets swapped, not the binding itself see
// `mocks/clients/database/realtime.ts`.
Deno.test(
  "installRealtimeMock: swaps realtime.topics and restores it",
  async () => {
    const original = realtime.topics;
    const mock = installRealtimeMock();

    assertNotStrictEquals(realtime.topics, original);
    assertEquals(await realtime.topics.users.add("room", "u1"), true);
    assertEquals(mock.calls("topics.users.add"), [["room", "u1"]]);

    mock.restore();
    assertStrictEquals(realtime.topics, original);
  },
);
