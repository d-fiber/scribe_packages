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

import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { report, requireStack, RUN_ID, STACK, timed, useStack } from "./support/stack.ts";

await requireStack(`${STACK.restUrl}/`);
await useStack();

const { DynamicLink, LinkError, resolveLink } = await import("@scribe/dynamic_links/mod.ts");
const { forgetLink } = await import("@scribe/dynamic_links/src/runtime/cache.ts");
const { dynamicLinks } = await import("@scribe/dynamic_links/src/db/tables.ts");

const invite = DynamicLink.deeplink(`e2e-invite-${RUN_ID}`, "/invite/{code}", {
  web: ({ code }) => `https://example.test/invite/${code}`,
  preview: ({ code }) => ({ title: `Invitation ${code}` }),
});

const promo = DynamicLink.redirect(`e2e-promo-${RUN_ID}`, "https://shop.example.test/{campaign}");

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
  assertEquals(resolved.data.route, "/invite/C3D4");
  assertEquals(resolved.data.target, "https://example.test/invite/C3D4");
  assertEquals(resolved.data.preview, { title: "Invitation C3D4" });
  assert(resolved.data.declaredBy(invite), "the row did not name the declaration that wrote it");
  report("link resolved", `${Math.round(took)} ms`);
});

Deno.test("dynamic links e2e: a redirect resolves to its address and to no route", async () => {
  const created = await promo.create({ campaign: "summer" });
  assert(created.ok);

  const resolved = await resolveLink(created.data.slug);

  assert(resolved.ok);
  assertEquals(resolved.data.route, null);
  assertEquals(resolved.data.target, "https://shop.example.test/summer");
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
