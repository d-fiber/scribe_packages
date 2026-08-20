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

import { LinkError, LinkOutcome, LinkPlatform } from "@scribe/dynamic_links/contracts/link.ts";
import { DynamicLink } from "@scribe/dynamic_links/src/core/declaration.ts";
import { dynamicLinkStatisticsQueue, type RecordedVisit } from "@scribe/dynamic_links/src/db/statistics.ts";
import { resolveLink } from "@scribe/dynamic_links/src/runtime/resolve.ts";
import { installDynamicLinksMock } from "@scribe/dynamic_links/testing/mock.ts";
import { installMock } from "@scribe/core/testing/install.ts";
import type { Row } from "@scribe/foundation/testing/database.ts";
import { assert, assertEquals } from "@std/assert";

const party = DynamicLink.deeplink("resolve-party", "/party/{partyId}", {
  web: ({ partyId }) => `https://example.test/party/${partyId}`,
});

function row(overrides: Row = {}): Row {
  return {
    link_id: 1,
    slug: "abcdefghij",
    payload: { k: "resolve-party", a: { partyId: "42" } },
    user_id: null,
    created_at: 1,
    updated_at: 1,
    expires_at: null,
    ...overrides,
  };
}

Deno.test("a resolved link answers the route, the address and the preview of its declaration", async () => {
  const database = installDynamicLinksMock({ __dynamic_links__: [row()] });

  try {
    const resolved = await resolveLink("abcdefghij");

    assert(resolved.ok, "a seeded slug must resolve");
    assertEquals(resolved.data.name, "resolve-party");
    assertEquals(resolved.data.route, "/party/42");
    assertEquals(resolved.data.target, "https://example.test/party/42");
    assertEquals(resolved.data.preview, null);
  } finally {
    database.restore();
  }
});

Deno.test("declaredBy answers for the declaration that wrote the link", async () => {
  const other = DynamicLink.deeplink("resolve-other", "/other/{id}");
  const database = installDynamicLinksMock({ __dynamic_links__: [row()] });

  try {
    const resolved = await resolveLink("abcdefghij");

    assert(resolved.ok);
    assert(resolved.data.declaredBy(party));
    assertEquals(resolved.data.args.partyId, "42");
    assert(!resolved.data.declaredBy(other));
  } finally {
    database.restore();
  }
});

Deno.test("a slug is loaded once, then answered from the cache", async () => {
  const database = installDynamicLinksMock({ __dynamic_links__: [row({ slug: "cachedslug" })] });

  try {
    const first = await resolveLink("cachedslug");
    database.seed("__dynamic_links__", []);
    const second = await resolveLink("cachedslug");

    assert(first.ok);
    assert(second.ok, "the second resolution must come from the cache, not from the table");
    assertEquals(second.data.slug, "cachedslug");
  } finally {
    database.restore();
  }
});

Deno.test("a slug nobody created is cached as absent", async () => {
  const database = installDynamicLinksMock();

  try {
    const first = await resolveLink("nothinghere");
    database.seed("__dynamic_links__", [row({ slug: "nothinghere" })]);
    const second = await resolveLink("nothinghere");

    assert(!first.ok);
    assertEquals(first.error, LinkError.NotFound);
    assert(!second.ok, "an absence must be cached too, otherwise a scanner reaches the table each time");
  } finally {
    database.restore();
  }
});

Deno.test("a link past its expiry answers expired rather than not found", async () => {
  const database = installDynamicLinksMock({
    __dynamic_links__: [row({ slug: "expiredslu", expires_at: Date.now() - 1 })],
  });

  try {
    const resolved = await resolveLink("expiredslu");

    assert(!resolved.ok);
    assertEquals(resolved.error, LinkError.Expired);
  } finally {
    database.restore();
  }
});

Deno.test("a link naming a declaration this process has not loaded answers unknown", async () => {
  const database = installDynamicLinksMock({
    __dynamic_links__: [row({ slug: "strangers", payload: { k: "nobody-declared-this", a: {} } })],
  });

  try {
    const resolved = await resolveLink("strangers");

    assert(!resolved.ok);
    assertEquals(resolved.error, LinkError.Unknown);
  } finally {
    database.restore();
  }
});

Deno.test("recording a visit enqueues it instead of writing it on the request path", async () => {
  const pushed: RecordedVisit[] = [];
  const queue = installMock(
    dynamicLinkStatisticsQueue,
    "push",
    ((visit: RecordedVisit) => {
      pushed.push(visit);
      return Promise.resolve("job-1");
    }) as typeof dynamicLinkStatisticsQueue.push,
  );
  const database = installDynamicLinksMock({ __dynamic_links__: [row({ slug: "recordslug" })] });

  try {
    const resolved = await resolveLink("recordslug");
    assert(resolved.ok);

    await resolved.data.record(LinkOutcome.OpenedApp, { platform: LinkPlatform.IOS });

    assertEquals(pushed, [{
      linkId: 1,
      outcome: LinkOutcome.OpenedApp,
      visitor: { platform: LinkPlatform.IOS },
    }]);
    assertEquals(database.statistics().length, 0, "serving a link must not wait for its measurement");
  } finally {
    database.restore();
    queue.restore();
  }
});
