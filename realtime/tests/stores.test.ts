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
  EventScope,
  type RealtimeRow,
  RealtimeTransports,
  TopicMembership,
} from "@scribe/realtime/mod.ts";
import { installDatabaseMock } from "@scribe/foundation/tests/database/mocks/install_database.ts";

class Spy {
  readonly sent: RealtimeRow[] = [];
  send(row: RealtimeRow): Promise<boolean> {
    this.sent.push(row);
    return Promise.resolve(true);
  }
}

function stage() {
  const spy = new Spy();
  RealtimeTransports.use(spy);
  const mock = installDatabaseMock({
    internal_t__user_topic_members: [],
    internal_t__admin_topic_members: [],
  });
  return { spy, mock, topics: new TopicMembership() };
}

Deno.test("user store: writes user_id in the user table", async () => {
  const { mock, topics } = stage();
  try {
    await topics.users.add("room", "u1");
    assertEquals(mock.rows("internal_t__user_topic_members"), [{ topic: "room", user_id: "u1" }]);
    assertEquals(mock.rows("internal_t__admin_topic_members"), []);
  } finally {
    mock.restore();
  }
});

Deno.test("admin store: writes admin_id in the admin table", async () => {
  const { mock, topics } = stage();
  try {
    await topics.admins.add("room", "a1");
    assertEquals(mock.rows("internal_t__admin_topic_members"), [{ topic: "room", admin_id: "a1" }]);
    assertEquals(mock.rows("internal_t__user_topic_members"), []);
  } finally {
    mock.restore();
  }
});

Deno.test("user store: joining notifies on the user's private channel", async () => {
  const { spy, mock, topics } = stage();
  try {
    await topics.users.add("room", "u1");

    assertEquals(spy.sent[0].entity, "topics");
    assertEquals(spy.sent[0].action, "joined");
    assertEquals(spy.sent[0].scope, EventScope.User);
    assertEquals(spy.sent[0].recipientId, "u1");
    assertEquals(spy.sent[0].entityId, "room");
  } finally {
    mock.restore();
  }
});

Deno.test("admin store: joining notifies on the admin's private channel", async () => {
  const { spy, mock, topics } = stage();
  try {
    await topics.admins.add("room", "a1");
    assertEquals(spy.sent[0].scope, EventScope.Admin);
    assertEquals(spy.sent[0].recipientId, "a1");
  } finally {
    mock.restore();
  }
});

Deno.test("store: leaving notifies the `left` action", async () => {
  const { spy, mock, topics } = stage();
  try {
    await topics.users.add("room", "u1");
    await topics.users.remove("room", "u1");
    assertEquals(spy.sent.at(-1)?.action, "left");
  } finally {
    mock.restore();
  }
});

Deno.test("store: the two roles never see each other's membership", async () => {
  const { mock, topics } = stage();
  try {
    await topics.users.add("room", "x1");

    assertEquals(await topics.users.has("room", "x1"), true);
    assertEquals(await topics.admins.has("room", "x1"), false);
  } finally {
    mock.restore();
  }
});

Deno.test("store: has/members/of/clear read back what was written", async () => {
  const { mock, topics } = stage();
  try {
    await topics.users.add("room", "u1");
    await topics.users.add("room", "u2");
    await topics.users.add("other", "u1");

    assertEquals((await topics.users.members("room")).sort(), ["u1", "u2"]);
    assertEquals((await topics.users.of("u1")).sort(), ["other", "room"]);
    assertEquals(await topics.users.clear("room"), true);
    assertEquals(await topics.users.members("room"), []);
    assertEquals(await topics.users.of("u1"), ["other"]);
  } finally {
    mock.restore();
  }
});
