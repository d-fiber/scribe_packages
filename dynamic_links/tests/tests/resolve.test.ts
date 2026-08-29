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
import "@scribe/testing/runner.ts";
import { equals, expect, fail, isFalse, isTrue, Scribe } from "@scribe/alchemy/test";
import { LinkError, LinkOutcome, LinkPlatform } from "../../lib/contracts/link.ts";
import { DynamicLink } from "../../lib/src/core/declaration.ts";
import { DestinationKind, type Visit } from "../../lib/src/core/destination.ts";
import { onLinkPreview } from "../../lib/src/core/preview.ts";
import { dynamicLinkStatisticsQueue, type RecordedVisit } from "../../lib/src/db/statistics.ts";
import { resolveLink } from "../../lib/src/runtime/resolve.ts";
import { installDynamicLinksMock } from "../testing/mock.ts";
import { installMock } from "@scribe/testing/install.ts";
import type { Row } from "@scribe/foundation/testing";

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

Scribe.test("a resolved link answers the destination and the preview of its declaration", async () => {
  const database = installDynamicLinksMock({ __dynamic_links__: [row()] });

  try {
    const resolved = await resolveLink("abcdefghij");
    if (!resolved.ok) fail("a seeded slug must resolve");

    expect(resolved.data.name, equals("resolve-party"));
    expect(
      resolved.data.destination(VISIT),
      equals({
        kind: DestinationKind.App,
        path: "/party/42",
        fallback: { kind: DestinationKind.Store },
      }),
    );
    expect(resolved.data.preview("fr"), equals(null));
  } finally {
    database.restore();
  }
});

Scribe.test("declaredBy answers for the declaration that wrote the link", async () => {
  const other = DynamicLink.deeplink<{ id: string }>("resolve-other", { path: "/other/{id}" });
  const database = installDynamicLinksMock({ __dynamic_links__: [row()] });

  try {
    const resolved = await resolveLink("abcdefghij");
    if (!resolved.ok) fail("a seeded slug must resolve");

    expect(resolved.data.declaredBy(party), isTrue);
    expect(resolved.data.data.partyId, equals("42"));
    expect(resolved.data.declaredBy(other), isFalse);
  } finally {
    database.restore();
  }
});

Scribe.test("a slug is loaded once, then answered from the cache", async () => {
  const database = installDynamicLinksMock({ __dynamic_links__: [row({ slug: "cachedslug" })] });

  try {
    const first = await resolveLink("cachedslug");
    database.seed("__dynamic_links__", []);
    const second = await resolveLink("cachedslug");

    expect(first.ok, isTrue);
    if (!second.ok) fail("the second resolution must come from the cache, not from the table");

    expect(second.data.slug, equals("cachedslug"));
  } finally {
    database.restore();
  }
});

Scribe.test("a slug nobody created is cached as absent", async () => {
  const database = installDynamicLinksMock();

  try {
    const first = await resolveLink("nothinghere");
    database.seed("__dynamic_links__", [row({ slug: "nothinghere" })]);
    const second = await resolveLink("nothinghere");

    if (first.ok) fail("a slug nobody created must not resolve");

    expect(first.error, equals(LinkError.NotFound));
    expect(second.ok, isFalse, "an absence must be cached too, otherwise a scanner reaches the table each time");
  } finally {
    database.restore();
  }
});

Scribe.test("a link past its expiry answers expired rather than not found", async () => {
  const database = installDynamicLinksMock({
    __dynamic_links__: [row({ slug: "expiredslu", expires_at: Date.now() - 1 })],
  });

  try {
    const resolved = await resolveLink("expiredslu");
    if (resolved.ok) fail("a link past its expiry must not resolve");

    expect(resolved.error, equals(LinkError.Expired));
  } finally {
    database.restore();
  }
});

Scribe.test("a link naming a declaration this process has not loaded answers unknown", async () => {
  const database = installDynamicLinksMock({
    __dynamic_links__: [row({ slug: "strangers", payload: { k: "nobody-declared-this", a: {} } })],
  });

  try {
    const resolved = await resolveLink("strangers");
    if (resolved.ok) fail("a link naming an undeclared declaration must not resolve");

    expect(resolved.error, equals(LinkError.Unknown));
  } finally {
    database.restore();
  }
});

Scribe.test("recording a visit enqueues it instead of writing it on the request path", async () => {
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
    if (!resolved.ok) fail("a seeded slug must resolve");

    await resolved.data.record(LinkOutcome.OpenedApp, { platform: LinkPlatform.IOS });

    expect(
      pushed,
      equals([{
        linkId: 1,
        outcome: LinkOutcome.OpenedApp,
        visitor: { platform: LinkPlatform.IOS },
      }]),
    );
    expect(database.statistics().length, equals(0), "serving a link must not wait for its measurement");
  } finally {
    database.restore();
    queue.restore();
  }
});

Scribe.test("a preview rule answers in the language the visitor announced", async () => {
  const database = installDynamicLinksMock({ __dynamic_links__: [row()] });
  onLinkPreview((link, locale) => ({ title: `${locale}:${link.name}:${link.data.partyId}` }));

  try {
    const resolved = await resolveLink("abcdefghij");
    if (!resolved.ok) fail("a seeded slug must resolve");

    expect(resolved.data.preview("fr"), equals({ title: "fr:resolve-party:42" }));
  } finally {
    onLinkPreview(null);
    database.restore();
  }
});
