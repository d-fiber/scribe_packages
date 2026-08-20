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
import { readAsRole, requireStack, RUN_ID, STACK, useStack } from "./support/stack.ts";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { Audience } = await import("@scribe/audience/mod.ts");

const banned = Audience.plain(`e2e-closed-${RUN_ID}`);

const PERMISSION_DENIED = "42501";

Deno.test(
  "audience e2e: the table answers the role the package talks as",
  async () => {
    await banned.add("d1");

    assertEquals(await readAsRole("service_role"), null);
    assert(await banned.has("d1"));
  },
);

Deno.test(
  "audience e2e: a signed-in caller reads nothing of the table",
  async () => {
    assertEquals(
      await readAsRole("authenticated"),
      PERMISSION_DENIED,
      "a session must not read who belongs to what, since the rights of everyone are in there",
    );
  },
);

Deno.test(
  "audience e2e: an anonymous caller reads nothing of the table",
  async () => {
    assertEquals(await readAsRole("anon"), PERMISSION_DENIED);
  },
);
