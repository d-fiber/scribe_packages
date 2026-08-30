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
import { equals, expect, fail, Scribe } from "@scribe/alchemy/test";
import { LinkOutcome, LinkPlatform } from "../../lib/contracts/link.ts";
import type { RecordedVisit } from "../../lib/src/db/statistics.ts";
import { installDynamicLinksMock } from "../testing/mock.ts";
import type { BatchHandler } from "@scribe/foundation/queue";
import { queueRegistry } from "@scribe/foundation/queue";
import "../../lib/src/db/statistics.ts";

const QUEUE_NAME = "dynamic-link-statistics";

function drain(): BatchHandler<RecordedVisit> {
  const registered = queueRegistry.get(QUEUE_NAME);
  if (!registered) fail(`${QUEUE_NAME} must be registered by importing the module that declares it`);
  expect(registered.mode, equals("batch"));
  return registered.handler as BatchHandler<RecordedVisit>;
}

function visit(overrides: Partial<RecordedVisit> = {}): RecordedVisit {
  return { linkId: 1, outcome: LinkOutcome.Served, visitor: {}, ...overrides };
}

Scribe.test("a group of visits is written by one insert", async () => {
  const database = installDynamicLinksMock();

  try {
    await drain()([
      visit(),
      visit({ linkId: 2, outcome: LinkOutcome.Redirected, visitor: { platform: LinkPlatform.Web } }),
    ]);

    const rows = database.statistics();
    expect(rows.length, equals(2));
    expect(rows[0].link_id, equals(1));
    expect(rows[0].outcome, equals(LinkOutcome.Served));
    expect(rows[1].platform, equals(LinkPlatform.Web));
  } finally {
    database.restore();
  }
});

Scribe.test("what the visitor did not announce is written as absent", async () => {
  const database = installDynamicLinksMock();

  try {
    await drain()([visit({ visitor: { userId: "user-1" } })]);

    const row = database.statistics()[0];
    expect(row.user_id, equals("user-1"));
    expect(row.device_id, equals(null));
    expect(row.ip_address, equals(null));
    expect(row.user_agent, equals(null));
    expect(row.referer, equals(null));
    expect(row.platform, equals(null));
  } finally {
    database.restore();
  }
});

Scribe.test("an empty group writes nothing", async () => {
  const database = installDynamicLinksMock();

  try {
    await drain()([]);

    expect(database.statistics().length, equals(0));
  } finally {
    database.restore();
  }
});
