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
import { allOf, equals, expect, fail, isA, isTrue, Scribe, throwsA, withMessage } from "@scribe/alchemy/test";
import { LinkError, LinkKind, LinkPlatform } from "../../lib/contracts/link.ts";
import { DynamicLink } from "../../lib/src/core/declaration.ts";
import { DestinationKind, Link, type Visit } from "../../lib/src/core/destination.ts";
import { installDynamicLinksMock } from "../testing/mock.ts";

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

Scribe.test("a created link carries the declaration and its parameters, and nothing else", async () => {
  const database = installDynamicLinksMock();

  try {
    const created = await invite.create({ code: "A1B2" });
    if (!created.ok) fail("creating a link must succeed against a table that accepts the insert");

    expect(database.links().length, equals(1));
    expect(database.links()[0].payload, equals({ k: "declaration-invite", a: { code: "A1B2" } }));
    expect(database.links()[0].slug, equals(created.data.slug));
  } finally {
    database.restore();
  }
});

Scribe.test("a slug is ten characters of letters and digits", async () => {
  const database = installDynamicLinksMock();

  try {
    const created = await invite.create({ code: "A1B2" });
    if (!created.ok) fail("creating a link must succeed against a table that accepts the insert");

    expect(created.data.slug.length, equals(10));
    expect(
      /^[A-Za-z0-9]{10}$/.test(created.data.slug),
      isTrue,
      `a slug travels in an address, it must hold no other character: ${created.data.slug}`,
    );
  } finally {
    database.restore();
  }
});

Scribe.test("a parameter the template does not get refuses the creation", async () => {
  const database = installDynamicLinksMock();

  try {
    const created = await invite.create({ code: "" });
    if (created.ok) fail("a link missing a parameter its template requires must not be created");

    expect(created.error, equals(LinkError.Params));
    expect(database.links().length, equals(0), "nothing must be written for a link nobody could serve");
  } finally {
    database.restore();
  }
});

Scribe.test("a deeplink sends a visitor to the route its data renders", () => {
  expect(invite.kind, equals(LinkKind.Deeplink));
  expect(
    invite.destinationFor(visitFrom(LinkPlatform.IOS), { code: "A1B2" }),
    equals({
      kind: DestinationKind.App,
      path: "/invite/A1B2",
      fallback: { kind: DestinationKind.Store },
    }),
  );
});

Scribe.test("a deeplink naming no path sends a visitor to the root of the application", () => {
  expect(
    bare.destinationFor(visitFrom(LinkPlatform.Android), {}),
    equals({
      kind: DestinationKind.App,
      path: "/",
      fallback: { kind: DestinationKind.Store },
    }),
  );
});

Scribe.test("a redirect sends a visitor to the address its template renders", () => {
  expect(promo.kind, equals(LinkKind.Redirect));
  expect(
    promo.destinationFor(visitFrom(LinkPlatform.Web), { campaign: "summer" }),
    equals({
      kind: DestinationKind.Web,
      url: "https://shop.example.test/summer",
    }),
  );
});

Scribe.test("an address that is not http sends a visitor nowhere", () => {
  const scheme = DynamicLink.redirect<{ payload: string }>("declaration-scheme", {
    url: "javascript:{payload}",
  });

  expect(
    scheme.destinationFor(visitFrom(LinkPlatform.Web), { payload: "alert(1)" }),
    equals({
      kind: DestinationKind.None,
    }),
  );
});

Scribe.test("a routed declaration answers what its own rule decided", () => {
  expect(smart.kind, equals(LinkKind.Routed));
  expect(
    smart.destinationFor(visitFrom(LinkPlatform.Web), { code: "A1B2" }),
    equals({
      kind: DestinationKind.Web,
      url: "https://example.test/i/A1B2",
    }),
  );
  expect(
    smart.destinationFor(visitFrom(LinkPlatform.IOS), { code: "A1B2" }),
    equals({
      kind: DestinationKind.App,
      path: "/invite/A1B2",
      fallback: { kind: DestinationKind.Store },
    }),
  );
});

Scribe.test("revoking a slug another declaration wrote answers not found", async () => {
  const database = installDynamicLinksMock();

  try {
    const created = await invite.create({ code: "A1B2" });
    if (!created.ok) fail("creating a link must succeed against a table that accepts the insert");

    const revoked = await promo.revoke(created.data.slug);
    if (revoked.ok) fail("a declaration must not revoke a slug it did not write");

    expect(revoked.error, equals(LinkError.NotFound));
    expect(database.links().length, equals(1), "a declaration must not remove another one's link");
  } finally {
    database.restore();
  }
});

Scribe.test("revoking a slug of this declaration removes it", async () => {
  const database = installDynamicLinksMock();

  try {
    const created = await invite.create({ code: "A1B2" });
    if (!created.ok) fail("creating a link must succeed against a table that accepts the insert");

    const revoked = await invite.revoke(created.data.slug);
    if (!revoked.ok) fail("revoking a slug this declaration wrote must succeed");

    expect(database.links().length, equals(0));
  } finally {
    database.restore();
  }
});

Scribe.test("two declarations cannot take the same name", () => {
  expect(
    () => DynamicLink.deeplink("declaration-invite", { path: "/other/{code}" }),
    throwsA(allOf(isA(TypeError), withMessage("declared twice"))),
  );
});
