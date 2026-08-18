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

// deno-lint-ignore-file no-explicit-any

import "@scribe/core/testing/settings.ts";
import { assertEquals } from "@std/assert";
import { TopicStore } from "@scribe/realtime/mod.ts";

function fakeQuery(rows: unknown[], seen: { limit: number | null }) {
  const builder: any = {
    selectRaw: () => builder,
    where: () => builder,
    limit: (n: number) => {
      seen.limit = n;
      return builder;
    },
    get: () => Promise.resolve(rows.slice(0, seen.limit ?? rows.length)),
  };
  return builder;
}

class ProbeStore extends TopicStore {
  readonly seen: { limit: number | null } = { limit: null };
  constructor(private readonly rows: unknown[]) {
    super();
  }
  protected override query(): any {
    return fakeQuery(this.rows, this.seen);
  }
  protected override get ownerColumn(): string {
    return "user_id";
  }
  override notify(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

Deno.test("bounds: members() never reads a topic whole", async () => {
  const rows = Array.from({ length: 5_000 }, (_, i) => ({ user_id: `u${i}` }));
  const store = new ProbeStore(rows);

  const listed = await store.members("room");

  assertEquals(store.seen.limit, 1_000);
  assertEquals(listed.length, 1_000);
});

Deno.test("bounds: of() never reads an account's topics whole", async () => {
  const rows = Array.from({ length: 5_000 }, (_, i) => ({ topic: `t${i}` }));
  const store = new ProbeStore(rows);

  const listed = await store.of("u1");

  assertEquals(store.seen.limit, 200);
  assertEquals(listed.length, 200);
});
