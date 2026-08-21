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

import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { report, requireStack, RUN_ID, STACK, timed, useStack } from "./support/stack.ts";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { DestinationKind, DynamicLink, LinkError, LinkPlatform, resolveLink } = await import(
  "@scribe/dynamic_links/mod.ts"
);
type Visit = import("@scribe/dynamic_links/mod.ts").Visit;
const { forgetLink } = await import("@scribe/dynamic_links/src/runtime/cache.ts");
const { dynamicLinks } = await import("@scribe/dynamic_links/src/db/tables.ts");

interface Invite {
  code: string;
}

interface Promo {
  campaign: string;
}

const invite = DynamicLink.deeplink<Invite>(`e2e-invite-${RUN_ID}`, { path: "/invite/{code}" });

const promo = DynamicLink.redirect<Promo>(`e2e-promo-${RUN_ID}`, {
  url: "https://shop.example.test/{campaign}",
});

const VISIT: Visit = {
  platform: LinkPlatform.IOS,
  isCrawler: false,
  userAgent: "e2e",
  ipAddress: "203.0.113.1",
  country: null,
  language: null,
};

Deno.test("dynamic links e2e: a created link is a row the database completed", async () => {
  const [created, took] = await timed(() => invite.create({ code: "A1B2" }));

  assert(created.ok, "the insert was refused by the table");

  const row = await dynamicLinks().where((f) => f.slug.eq(created.data.slug)).getOne();

  assert(row, "the slug the package answered names no row");
  assertEquals(row.payload, { k: `e2e-invite-${RUN_ID}`, a: { code: "A1B2" } });
  assert(row.link_id > 0, "the identity column gave no identifier");
  assert(row.created_at > 0, "the trigger did not stamp created_at");
  assertEquals(row.created_at, row.updated_at, "an insert stamps both timestamps with one clock read");
  assertEquals(created.data.createdAt, row.created_at, "the answer and the row disagree on when it was written");
  report("link created", `${Math.round(took)} ms`);
});

Deno.test("dynamic links e2e: two links of one declaration take two slugs", async () => {
  const first = await invite.create({ code: "A1B2" });
  const second = await invite.create({ code: "A1B2" });

  assert(first.ok && second.ok);
  assertNotEquals(first.data.slug, second.data.slug, "the same parameters must not answer the same address");
});

Deno.test("dynamic links e2e: a resolved link renders what its declaration decides", async () => {
  const created = await invite.create({ code: "C3D4" });
  assert(created.ok);

  const [resolved, took] = await timed(() => resolveLink(created.data.slug));

  assert(resolved.ok, "a slug that was just written did not resolve");
  assertEquals(resolved.data.name, `e2e-invite-${RUN_ID}`);
  assertEquals(resolved.data.destination(VISIT), {
    kind: DestinationKind.App,
    path: "/invite/C3D4",
    fallback: { kind: DestinationKind.Store },
  });
  assert(resolved.data.declaredBy(invite), "the row did not name the declaration that wrote it");
  report("link resolved", `${Math.round(took)} ms`);
});

Deno.test("dynamic links e2e: a redirect resolves to its address and to no route", async () => {
  const created = await promo.create({ campaign: "summer" });
  assert(created.ok);

  const resolved = await resolveLink(created.data.slug);

  assert(resolved.ok);
  assertEquals(resolved.data.destination(VISIT), {
    kind: DestinationKind.Web,
    url: "https://shop.example.test/summer",
  });
});

Deno.test("dynamic links e2e: a resolved slug is answered from Redis, not from the table", async () => {
  const created = await invite.create({ code: "E5F6" });
  assert(created.ok);

  const slug = created.data.slug;
  await resolveLink(slug);
  await dynamicLinks().where((f) => f.slug.eq(slug)).delete();

  const cached = await resolveLink(slug);
  assert(cached.ok, "the second resolution reached the table, so nothing was cached");

  await forgetLink(slug);
  const forgotten = await resolveLink(slug);

  assert(!forgotten.ok);
  assertEquals(forgotten.error, LinkError.NotFound, "the cache kept answering after it was told to forget");
});

Deno.test("dynamic links e2e: a slug nobody created is cached as absent", async () => {
  const slug = `absent${RUN_ID}`;

  const first = await resolveLink(slug);
  await dynamicLinks().insertOne({
    slug,
    payload: { k: `e2e-invite-${RUN_ID}`, a: { code: "G7H8" } },
    expires_at: null,
    user_id: null,
  });
  const second = await resolveLink(slug);

  assert(!first.ok);
  assertEquals(first.error, LinkError.NotFound);
  assert(!second.ok, "an absence must be cached too, otherwise a scanner reaches the table on every try");

  await forgetLink(slug);
});

Deno.test("dynamic links e2e: a link past its expiry answers expired", async () => {
  const created = await invite.create({ code: "I9J0" }, { expiresAt: Date.now() - 1_000 });
  assert(created.ok);

  const resolved = await resolveLink(created.data.slug);

  assert(!resolved.ok);
  assertEquals(resolved.error, LinkError.Expired, "an expired link must be told apart from an unknown one");
});

Deno.test("dynamic links e2e: a row naming a declaration nobody loaded answers unknown", async () => {
  const slug = `stranger${RUN_ID}`;
  await dynamicLinks().insertOne({
    slug,
    payload: { k: `nobody-declared-this-${RUN_ID}`, a: {} },
    expires_at: null,
    user_id: null,
  });

  const resolved = await resolveLink(slug);

  assert(!resolved.ok);
  assertEquals(resolved.error, LinkError.Unknown);
  await forgetLink(slug);
});

Deno.test("dynamic links e2e: revoking removes the row and stops the cache from answering", async () => {
  const created = await invite.create({ code: "K1L2" });
  assert(created.ok);

  const slug = created.data.slug;
  await resolveLink(slug);

  const revoked = await invite.revoke(slug);
  assert(revoked.ok, "the delete was refused by the table");

  assertEquals(await dynamicLinks().where((f) => f.slug.eq(slug)).getOne(), null);

  const resolved = await resolveLink(slug);
  assert(!resolved.ok);
  assertEquals(resolved.error, LinkError.NotFound, "a revoked link kept answering from the cache");
});

Deno.test("dynamic links e2e: a declaration cannot revoke another one's link", async () => {
  const created = await invite.create({ code: "M3N4" });
  assert(created.ok);

  const revoked = await promo.revoke(created.data.slug);

  assert(!revoked.ok);
  assertEquals(revoked.error, LinkError.NotFound);
  assert(
    await dynamicLinks().where((f) => f.slug.eq(created.data.slug)).getOne(),
    "the row was removed by a declaration that did not write it",
  );
});

Deno.test("dynamic links e2e: the table refuses a second link on one slug", async () => {
  const created = await invite.create({ code: "O5P6" });
  assert(created.ok);

  const twice = await dynamicLinks().insertOne({
    slug: created.data.slug,
    payload: { k: `e2e-invite-${RUN_ID}`, a: { code: "O5P6" } },
    expires_at: null,
    user_id: null,
  });

  assertEquals(twice, null, "the unique index on the slug is what makes an address name one link");
});
