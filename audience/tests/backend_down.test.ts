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

import { AudienceError } from "@scribe/audience/contracts/audience.ts";
import { Audience } from "@scribe/audience/src/core/declaration.ts";
import { audiencesOf } from "@scribe/audience/src/core/member.ts";
import { installAudienceMock } from "@scribe/audience/testing/mock.ts";
import { PostgrestClients } from "@scribe/foundation/src/database/client.ts";
import { type InstalledMock, installMock } from "@scribe/core/testing/install.ts";
import type { PostgrestClient } from "@supabase/postgrest-js";
import { assertEquals, assertFalse } from "@std/assert";

const editors = Audience.keyed("down-editors");

function installUnreachableDatabase(): InstalledMock {
  const unreachable = {
    from(): never {
      throw new Error("connection refused");
    },
  };

  return installMock(
    PostgrestClients,
    "service",
    () => unreachable as unknown as PostgrestClient,
  );
}

Deno.test("a table that cannot be reached lets nobody through", async () => {
  const audiences = installAudienceMock();
  const down = installUnreachableDatabase();

  try {
    assertFalse(await editors.in("p1").has("a1"));
  } finally {
    down.restore();
    audiences.restore();
  }
});

Deno.test("a table that cannot be reached lists nobody", async () => {
  const audiences = installAudienceMock();
  const down = installUnreachableDatabase();

  try {
    assertEquals(await editors.in("p1").members(), []);
    assertEquals(await audiencesOf("a1"), []);
  } finally {
    down.restore();
    audiences.restore();
  }
});

Deno.test("a table that cannot be reached refuses a write instead of throwing", async () => {
  const audiences = installAudienceMock();
  const down = installUnreachableDatabase();

  try {
    const added = await editors.in("p1").add("a1");

    assertFalse(added.ok);
    assertEquals(added.ok ? null : added.error, AudienceError.Backend);
  } finally {
    down.restore();
    audiences.restore();
  }
});
