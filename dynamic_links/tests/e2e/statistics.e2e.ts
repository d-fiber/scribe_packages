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

import { assert, assertEquals } from "@std/assert";
import { report, requireStack, RUN_ID, STACK, STATISTICS_QUEUE, timed, useStack } from "./support/stack.ts";

await requireStack(`${STACK.restUrl}/`, `${STACK.natsMonitorUrl}/healthz`);
await useStack();

const { DynamicLink, LinkOutcome, LinkPlatform, resolveLink } = await import(
  "@scribe/dynamic_links/lib/dynamic_links.ts"
);
const { dynamicLinks, dynamicLinkStatistics } = await import("@scribe/dynamic_links/lib/src/db/tables.ts");
const { queueRunner } = await import("@scribe/foundation/queue");

const KEEPS_A_CONNECTION = { sanitizeOps: false, sanitizeResources: false } as const;

const visited = DynamicLink.deeplink<{ partyId: string }>(`e2e-visited-${RUN_ID}`, {
  path: "/party/{partyId}",
});

async function drain(expected: number): Promise<number> {
  let moved = 0;

  for (let pass = 0; pass < 10 && moved < expected; pass++) {
    const result = await queueRunner.runOne(STATISTICS_QUEUE, 200);
    const step = (result?.done ?? 0) + (result?.retried ?? 0) + (result?.dead ?? 0);
    if (step === 0) break;
    moved += step;
  }
  return moved;
}

async function link(partyId: string): Promise<{ slug: string; id: number }> {
  const created = await visited.create({ partyId });
  assert(created.ok, "the link a statistics test needs could not be created");

  const row = await dynamicLinks().where((f) => f.slug.eq(created.data.slug)).getOne();
  assert(row, "the link that was just created names no row");

  return { slug: created.data.slug, id: row.link_id };
}

async function visitsOf(id: number) {
  return await dynamicLinkStatistics().where((f) => f.link_id.eq(id)).get();
}

Deno.test({
  name: "dynamic links e2e: a visit crosses NATS and lands as a row",
  ...KEEPS_A_CONNECTION,
  async fn() {
    const party = await link("42");
    const resolved = await resolveLink(party.slug);
    assert(resolved.ok);

    const [, took] = await timed(() =>
      resolved.data.record(LinkOutcome.OpenedApp, {
        platform: LinkPlatform.IOS,
        deviceId: "device-1",
        userAgent: "e2e",
        referer: "https://example.test/",
      })
    );

    assertEquals(await visitsOf(party.id), [], "the request path wrote the visit instead of queuing it");
    assert(await drain(1) >= 1, "nothing came back out of the queue");

    const rows = await visitsOf(party.id);
    assertEquals(rows.length, 1);
    assertEquals(rows[0].outcome, LinkOutcome.OpenedApp);
    assertEquals(rows[0].platform, LinkPlatform.IOS);
    assertEquals(rows[0].device_id, "device-1");
    assertEquals(rows[0].user_agent, "e2e");
    assertEquals(rows[0].referer, "https://example.test/");
    assertEquals(rows[0].user_id, null);
    assert(rows[0].created_at > 0, "the default did not stamp created_at");
    report("visit recorded", `${Math.round(took)} ms to hand over`);
  },
});

Deno.test({
  name: "dynamic links e2e: visits of one pass are written as one group",
  ...KEEPS_A_CONNECTION,
  async fn() {
    const party = await link("77");
    const resolved = await resolveLink(party.slug);
    assert(resolved.ok);

    await resolved.data.record(LinkOutcome.Served);
    await resolved.data.record(LinkOutcome.Redirected, { platform: LinkPlatform.Web });
    await resolved.data.record(LinkOutcome.Crawler);
    await drain(3);

    const rows = await visitsOf(party.id);

    assertEquals(rows.length, 3);
    assertEquals(
      new Set(rows.map((row) => row.outcome)),
      new Set([LinkOutcome.Served, LinkOutcome.Redirected, LinkOutcome.Crawler]),
    );
  },
});

Deno.test({
  name: "dynamic links e2e: the table refuses an outcome the package does not name",
  ...KEEPS_A_CONNECTION,
  async fn() {
    const party = await link("88");

    const written = await dynamicLinkStatistics().insert([{ link_id: party.id, outcome: "teleported" }]);

    assertEquals(written.ok, false, "the check constraint is what keeps the column readable by an aggregate");
    assertEquals(await visitsOf(party.id), []);
  },
});

Deno.test({
  name: "dynamic links e2e: removing a link takes its visits with it",
  ...KEEPS_A_CONNECTION,
  async fn() {
    const party = await link("99");
    const resolved = await resolveLink(party.slug);
    assert(resolved.ok);

    await resolved.data.record(LinkOutcome.Served);
    await drain(1);
    assertEquals((await visitsOf(party.id)).length, 1);

    const revoked = await visited.revoke(party.slug);
    assert(revoked.ok);

    assertEquals(await visitsOf(party.id), [], "the cascade left visits pointing at a link that is gone");
  },
});

Deno.test({
  name: "dynamic links e2e: a page of statistics answers the visits of one link",
  ...KEEPS_A_CONNECTION,
  async fn() {
    const party = await link("123");
    const resolved = await resolveLink(party.slug);
    assert(resolved.ok);

    await resolved.data.record(LinkOutcome.Served);
    await resolved.data.record(LinkOutcome.StoreFallback);
    await drain(2);

    const page = await visited.statistics(party.slug, { size: 1 });

    assert(page.ok);
    assertEquals(page.data.items.length, 1);
    assertEquals(page.data.hasMore, true, "a page of one on two visits must say there is more");
  },
});
