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

import { LinkError, LinkKind, LinkPlatform } from "@scribe/dynamic_links/contracts/link.ts";
import { DynamicLink } from "@scribe/dynamic_links/src/core/declaration.ts";
import { DestinationKind, Link, type Visit } from "@scribe/dynamic_links/src/core/destination.ts";
import { installDynamicLinksMock } from "@scribe/dynamic_links/testing/mock.ts";
import { assert, assertEquals, assertThrows } from "@std/assert";

interface Invite {
  code: string;
}

interface Promo {
  campaign: string;
}

const invite = DynamicLink.deeplink<Invite>("declaration-invite", { path: "/invite/{code}" });

const promo = DynamicLink.redirect<Promo>("declaration-promo", {
  url: "https://shop.example.test/{campaign}",
});

const bare = DynamicLink.deeplink("declaration-bare");

const smart = DynamicLink.routed<Invite>("declaration-smart", {
  decide: (visit, data) =>
    visit.platform === LinkPlatform.Web
      ? Link.web(`https://example.test/i/${data.code}`)
      : Link.app(`/invite/${data.code}`),
});

function visitFrom(platform: LinkPlatform): Visit {
  return {
    platform,
    isCrawler: false,
    userAgent: "test",
    ipAddress: "203.0.113.1",
    country: null,
    language: null,
  };
}

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

Deno.test("a deeplink sends a visitor to the route its data renders", () => {
  assertEquals(invite.kind, LinkKind.Deeplink);
  assertEquals(invite.destinationFor(visitFrom(LinkPlatform.IOS), { code: "A1B2" }), {
    kind: DestinationKind.App,
    path: "/invite/A1B2",
    fallback: { kind: DestinationKind.Store },
  });
});

Deno.test("a deeplink naming no path sends a visitor to the root of the application", () => {
  assertEquals(bare.destinationFor(visitFrom(LinkPlatform.Android), {}), {
    kind: DestinationKind.App,
    path: "/",
    fallback: { kind: DestinationKind.Store },
  });
});

Deno.test("a redirect sends a visitor to the address its template renders", () => {
  assertEquals(promo.kind, LinkKind.Redirect);
  assertEquals(promo.destinationFor(visitFrom(LinkPlatform.Web), { campaign: "summer" }), {
    kind: DestinationKind.Web,
    url: "https://shop.example.test/summer",
  });
});

Deno.test("an address that is not http sends a visitor nowhere", () => {
  const scheme = DynamicLink.redirect<{ payload: string }>("declaration-scheme", {
    url: "javascript:{payload}",
  });

  assertEquals(scheme.destinationFor(visitFrom(LinkPlatform.Web), { payload: "alert(1)" }), {
    kind: DestinationKind.None,
  });
});

Deno.test("a routed declaration answers what its own rule decided", () => {
  assertEquals(smart.kind, LinkKind.Routed);
  assertEquals(smart.destinationFor(visitFrom(LinkPlatform.Web), { code: "A1B2" }), {
    kind: DestinationKind.Web,
    url: "https://example.test/i/A1B2",
  });
  assertEquals(smart.destinationFor(visitFrom(LinkPlatform.IOS), { code: "A1B2" }), {
    kind: DestinationKind.App,
    path: "/invite/A1B2",
    fallback: { kind: DestinationKind.Store },
  });
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
    () => DynamicLink.deeplink("declaration-invite", { path: "/other/{code}" }),
    TypeError,
    "declared twice",
  );
});
