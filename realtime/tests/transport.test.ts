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

import "@scribe/core/testing/settings.ts";
import { assertEquals } from "@std/assert";
import {
  defineRealtime,
  event,
  EventScope,
  type RealtimeRow,
  RealtimeTransports,
  SyncEventsTransport,
} from "@scribe/realtime/mod.ts";
import { installDatabaseMock } from "@scribe/foundation/tests/database/mocks/install_database.ts";

const thing = defineRealtime({ entity: "thing", events: { changed: event("update") } });

class Spy {
  readonly sent: RealtimeRow[] = [];
  send(row: RealtimeRow): Promise<boolean> {
    this.sent.push(row);
    return Promise.resolve(true);
  }
}

Deno.test("registry: with no transport, an emission is refused, never thrown", async () => {
  RealtimeTransports.use(undefined as never);
  assertEquals(await thing.changed.all.users("t1"), false);
});

Deno.test("registry: registering swaps the destination for good", async () => {
  const first = new Spy();
  const second = new Spy();

  RealtimeTransports.use(first);
  await thing.changed.all.users("t1");
  RealtimeTransports.use(second);
  await thing.changed.all.users("t2");

  assertEquals(first.sent.length, 1);
  assertEquals(second.sent.length, 1);
});

Deno.test("registry: an invalid topic is dropped before the transport is reached", async () => {
  const spy = new Spy();
  RealtimeTransports.use(spy);

  assertEquals(await thing.changed.topic.users("t1", "bad topic"), false);
  assertEquals(await thing.changed.to.user("t1", "u1", "bad/topic"), false);
  assertEquals(spy.sent.length, 0);
});

Deno.test("registry: a null topic is not a topic to validate", async () => {
  const spy = new Spy();
  RealtimeTransports.use(spy);

  assertEquals(await thing.changed.all.users("t1"), true);
  assertEquals(spy.sent[0].topic, null);
});

Deno.test("sync_events: a row becomes one insert with the SQL column names", async () => {
  const mock = installDatabaseMock({ internal_t__sync_events: [] });
  try {
    RealtimeTransports.use(new SyncEventsTransport());
    await thing.changed.to.user("t1", "u1", "room");

    assertEquals(mock.rows("internal_t__sync_events"), [{
      scope: EventScope.User,
      topic: "room",
      entity: "thing",
      action: "update",
      entity_id: "t1",
      recipient_id: "u1",
    }]);
  } finally {
    mock.restore();
  }
});

Deno.test("sync_events: an audience row carries no recipient column", async () => {
  const mock = installDatabaseMock({ internal_t__sync_events: [] });
  try {
    RealtimeTransports.use(new SyncEventsTransport());
    await thing.changed.all.admins("t1");

    const row = mock.rows("internal_t__sync_events")[0];
    assertEquals(row.scope, EventScope.Admins);
    assertEquals(row.recipient_id, undefined);
    assertEquals(row.topic, null);
  } finally {
    mock.restore();
  }
});
