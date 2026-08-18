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
} from "@scribe/realtime/mod.ts";

class Spy {
  readonly sent: RealtimeRow[] = [];
  answer = true;
  send(row: RealtimeRow): Promise<boolean> {
    this.sent.push(row);
    return Promise.resolve(this.answer);
  }
}

function spying(): Spy {
  const spy = new Spy();
  RealtimeTransports.use(spy);
  return spy;
}

const thing = defineRealtime({ entity: "thing", events: { changed: event("update") } });
const base = { entity: "thing", action: "update", entityId: "t1" };

Deno.test("to.user: private channel of a user", async () => {
  const spy = spying();
  await thing.changed.to.user("t1", "u1");
  assertEquals(spy.sent[0], { ...base, scope: EventScope.User, recipientId: "u1", topic: null });
});

Deno.test("to.admin: private channel of an admin", async () => {
  const spy = spying();
  await thing.changed.to.admin("t1", "a1");
  assertEquals(spy.sent[0], { ...base, scope: EventScope.Admin, recipientId: "a1", topic: null });
});

Deno.test("to.*: an optional topic narrows the private channel", async () => {
  const spy = spying();
  await thing.changed.to.user("t1", "u1", "room");
  await thing.changed.to.admin("t1", "a1", "room");
  assertEquals(spy.sent[0].topic, "room");
  assertEquals(spy.sent[1].topic, "room");
});

Deno.test("all.users / all.admins: a whole role, never a recipient", async () => {
  const spy = spying();
  await thing.changed.all.users("t1");
  await thing.changed.all.admins("t1");

  assertEquals(spy.sent[0], { ...base, scope: EventScope.Users, recipientId: null, topic: null });
  assertEquals(spy.sent[1], { ...base, scope: EventScope.Admins, recipientId: null, topic: null });
});

Deno.test("topic.users / topic.admins: a role restricted to a topic", async () => {
  const spy = spying();
  await thing.changed.topic.users("t1", "room");
  await thing.changed.topic.admins("t1", "room");

  assertEquals(spy.sent[0], { ...base, scope: EventScope.Users, recipientId: null, topic: "room" });
  assertEquals(spy.sent[1], { ...base, scope: EventScope.Admins, recipientId: null, topic: "room" });
});

Deno.test("dispatch: the action of the event travels, not the event name", async () => {
  const spy = spying();
  const d = defineRealtime({
    entity: "thing",
    events: { signedOut: event("sign_out") },
  });
  await d.signedOut.to.user("t1", "u1");
  assertEquals(spy.sent[0].action, "sign_out");
});

Deno.test("dispatch: the transport's answer is what the caller sees", async () => {
  const spy = spying();
  assertEquals(await thing.changed.all.users("t1"), true);
  spy.answer = false;
  assertEquals(await thing.changed.all.users("t1"), false);
});

Deno.test("dispatch: each emission builds a fresh row, none is shared", async () => {
  const spy = spying();
  await thing.changed.to.user("t1", "u1");
  await thing.changed.to.user("t2", "u2");

  assertEquals(spy.sent[0] === spy.sent[1], false);
  assertEquals(spy.sent[0].entityId, "t1");
  assertEquals(spy.sent[1].entityId, "t2");
});
