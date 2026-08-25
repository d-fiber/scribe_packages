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

import { LinkOutcome, LinkPlatform } from "@scribe/dynamic_links/lib/contracts/link.ts";
import type { RecordedVisit } from "@scribe/dynamic_links/lib/src/db/statistics.ts";
import { installDynamicLinksMock } from "@scribe/dynamic_links/tests/testing/mock.ts";
import type { BatchHandler } from "@scribe/foundation/lib/src/queue/queue_options.ts";
import { queueRegistry } from "@scribe/foundation/lib/src/queue/queue_registry.ts";
import { assert, assertEquals } from "@std/assert";

import "@scribe/dynamic_links/lib/src/db/statistics.ts";

const QUEUE_NAME = "dynamic-link-statistics";

function drain(): BatchHandler<RecordedVisit> {
  const registered = queueRegistry.get(QUEUE_NAME);
  assert(registered, `${QUEUE_NAME} must be registered by importing the module that declares it`);
  assertEquals(registered.mode, "batch");
  return registered.handler as BatchHandler<RecordedVisit>;
}

function visit(overrides: Partial<RecordedVisit> = {}): RecordedVisit {
  return { linkId: 1, outcome: LinkOutcome.Served, visitor: {}, ...overrides };
}

Deno.test("a group of visits is written by one insert", async () => {
  const database = installDynamicLinksMock();

  try {
    await drain()([
      visit(),
      visit({ linkId: 2, outcome: LinkOutcome.Redirected, visitor: { platform: LinkPlatform.Web } }),
    ]);

    const rows = database.statistics();
    assertEquals(rows.length, 2);
    assertEquals(rows[0].link_id, 1);
    assertEquals(rows[0].outcome, LinkOutcome.Served);
    assertEquals(rows[1].platform, LinkPlatform.Web);
  } finally {
    database.restore();
  }
});

Deno.test("what the visitor did not announce is written as absent", async () => {
  const database = installDynamicLinksMock();

  try {
    await drain()([visit({ visitor: { userId: "user-1" } })]);

    const row = database.statistics()[0];
    assertEquals(row.user_id, "user-1");
    assertEquals(row.device_id, null);
    assertEquals(row.ip_address, null);
    assertEquals(row.user_agent, null);
    assertEquals(row.referer, null);
    assertEquals(row.platform, null);
  } finally {
    database.restore();
  }
});

Deno.test("an empty group writes nothing", async () => {
  const database = installDynamicLinksMock();

  try {
    await drain()([]);

    assertEquals(database.statistics().length, 0);
  } finally {
    database.restore();
  }
});
