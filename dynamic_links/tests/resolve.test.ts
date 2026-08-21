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

import { LinkError, LinkOutcome, LinkPlatform } from "@scribe/dynamic_links/contracts/link.ts";
import { DynamicLink } from "@scribe/dynamic_links/src/core/declaration.ts";
import { DestinationKind, type Visit } from "@scribe/dynamic_links/src/core/destination.ts";
import { onLinkPreview } from "@scribe/dynamic_links/src/core/preview.ts";
import { dynamicLinkStatisticsQueue, type RecordedVisit } from "@scribe/dynamic_links/src/db/statistics.ts";
import { resolveLink } from "@scribe/dynamic_links/src/runtime/resolve.ts";
import { installDynamicLinksMock } from "@scribe/dynamic_links/testing/mock.ts";
import { installMock } from "@scribe/core/testing/install.ts";
import type { Row } from "@scribe/foundation/tests/testing/database.ts";
import { assert, assertEquals } from "@std/assert";

interface Party {
  partyId: string;
}

const party = DynamicLink.deeplink<Party>("resolve-party", { path: "/party/{partyId}" });

const VISIT: Visit = {
  platform: LinkPlatform.IOS,
  isCrawler: false,
  userAgent: "test",
  ipAddress: "203.0.113.1",
  country: null,
  language: "fr",
};

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

Deno.test("a resolved link answers the destination and the preview of its declaration", async () => {
  const database = installDynamicLinksMock({ __dynamic_links__: [row()] });

  try {
    const resolved = await resolveLink("abcdefghij");

    assert(resolved.ok, "a seeded slug must resolve");
    assertEquals(resolved.data.name, "resolve-party");
    assertEquals(resolved.data.destination(VISIT), {
      kind: DestinationKind.App,
      path: "/party/42",
      fallback: { kind: DestinationKind.Store },
    });
    assertEquals(resolved.data.preview("fr"), null);
  } finally {
    database.restore();
  }
});

Deno.test("declaredBy answers for the declaration that wrote the link", async () => {
  const other = DynamicLink.deeplink<{ id: string }>("resolve-other", { path: "/other/{id}" });
  const database = installDynamicLinksMock({ __dynamic_links__: [row()] });

  try {
    const resolved = await resolveLink("abcdefghij");

    assert(resolved.ok);
    assert(resolved.data.declaredBy(party));
    assertEquals(resolved.data.data.partyId, "42");
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

Deno.test("a preview rule answers in the language the visitor announced", async () => {
  const database = installDynamicLinksMock({ __dynamic_links__: [row()] });
  onLinkPreview((link, locale) => ({ title: `${locale}:${link.name}:${link.data.partyId}` }));

  try {
    const resolved = await resolveLink("abcdefghij");

    assert(resolved.ok);
    assertEquals(resolved.data.preview("fr"), { title: "fr:resolve-party:42" });
  } finally {
    onLinkPreview(null);
    database.restore();
  }
});
