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

import { LinkOutcome, LinkPlatform } from "@scribe/dynamic_links/contracts/link.ts";
import type { RecordedVisit } from "@scribe/dynamic_links/src/db/statistics.ts";
import { installDynamicLinksMock } from "@scribe/dynamic_links/testing/mock.ts";
import type { BatchHandler } from "@scribe/foundation/contracts/queue/queue.ts";
import { queueRegistry } from "@scribe/foundation/src/queue/core/registry.ts";
import { assert, assertEquals } from "@std/assert";

import "@scribe/dynamic_links/src/db/statistics.ts";

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
