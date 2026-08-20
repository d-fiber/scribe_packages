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

import { LinkError, LinkKind } from "@scribe/dynamic_links/contracts/link.ts";
import { DynamicLink } from "@scribe/dynamic_links/src/core/declaration.ts";
import { installDynamicLinksMock } from "@scribe/dynamic_links/testing/mock.ts";
import { assert, assertEquals, assertThrows } from "@std/assert";

const invite = DynamicLink.deeplink("declaration-invite", "/invite/{code}", {
  web: ({ code }) => `https://example.test/invite/${code}`,
  preview: ({ code }) => ({ title: `Invitation ${code}` }),
});

const promo = DynamicLink.redirect("declaration-promo", "https://shop.example.test/{campaign}");

Deno.test("a created link carries the declaration and its parameters, and nothing else", async () => {
  const database = installDynamicLinksMock();

  try {
    const created = await invite.create({ code: "A1B2" });

    assert(created.ok, "creating a link must succeed against a table that accepts the insert");
    assertEquals(database.links().length, 1);
    assertEquals(database.links()[0].payload, { k: "declaration-invite", a: { code: "A1B2" } });
    assertEquals(database.links()[0].slug, created.data.slug);
  } finally {
    database.restore();
  }
});

Deno.test("a slug is ten characters of letters and digits", async () => {
  const database = installDynamicLinksMock();

  try {
    const created = await invite.create({ code: "A1B2" });

    assert(created.ok);
    assertEquals(created.data.slug.length, 10);
    assert(
      /^[A-Za-z0-9]{10}$/.test(created.data.slug),
      `a slug travels in an address, it must hold no other character: ${created.data.slug}`,
    );
  } finally {
    database.restore();
  }
});

Deno.test("a parameter the template does not get refuses the creation", async () => {
  const database = installDynamicLinksMock();

  try {
    const created = await invite.create({ code: "" });

    assert(!created.ok);
    assertEquals(created.error, LinkError.Params);
    assertEquals(database.links().length, 0, "nothing must be written for a link nobody could serve");
  } finally {
    database.restore();
  }
});

Deno.test("a declaration renders the route and the web address of its parameters", () => {
  assertEquals(invite.kind, LinkKind.Deeplink);
  assertEquals(invite.routeFor({ code: "A1B2" }), "/invite/A1B2");
  assertEquals(invite.targetFor({ code: "A1B2" }), "https://example.test/invite/A1B2");
  assertEquals(invite.previewFor({ code: "A1B2" }), { title: "Invitation A1B2" });
});

Deno.test("a redirect names no route, and answers the address its template renders", () => {
  assertEquals(promo.kind, LinkKind.Redirect);
  assertEquals(promo.routeFor({ campaign: "summer" }), null);
  assertEquals(promo.targetFor({ campaign: "summer" }), "https://shop.example.test/summer");
});

Deno.test("an address that is not http answers as no address at all", () => {
  const scheme = DynamicLink.redirect("declaration-scheme", "javascript:{payload}");

  assertEquals(scheme.targetFor({ payload: "alert(1)" }), null);
});

Deno.test("revoking a slug another declaration wrote answers not found", async () => {
  const database = installDynamicLinksMock();

  try {
    const created = await invite.create({ code: "A1B2" });
    assert(created.ok);

    const revoked = await promo.revoke(created.data.slug);

    assert(!revoked.ok);
    assertEquals(revoked.error, LinkError.NotFound);
    assertEquals(database.links().length, 1, "a declaration must not remove another one's link");
  } finally {
    database.restore();
  }
});

Deno.test("revoking a slug of this declaration removes it", async () => {
  const database = installDynamicLinksMock();

  try {
    const created = await invite.create({ code: "A1B2" });
    assert(created.ok);

    const revoked = await invite.revoke(created.data.slug);

    assert(revoked.ok);
    assertEquals(database.links().length, 0);
  } finally {
    database.restore();
  }
});

Deno.test("two declarations cannot take the same name", () => {
  assertThrows(
    () => DynamicLink.deeplink("declaration-invite", "/other/{code}"),
    TypeError,
    "declared twice",
  );
});
