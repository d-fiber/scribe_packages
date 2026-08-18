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

import { assertEquals } from "@std/assert";
import { TopicMembers, TopicStore } from "@scribe/realtime/mod.ts";

class FakeStore extends TopicStore {
  readonly rows = new Set<string>();
  readonly notified: Array<{ id: string; topic: string; joined: boolean }> = [];
  removeAnswer = true;

  protected override query(): never {
    throw new Error("the fake overrides every operation");
  }

  protected override get ownerColumn(): string {
    return "user_id";
  }

  override add(topic: string, id: string): Promise<boolean> {
    this.rows.add(`${topic}/${id}`);
    return Promise.resolve(true);
  }

  override has(topic: string, id: string): Promise<boolean> {
    return Promise.resolve(this.rows.has(`${topic}/${id}`));
  }

  override remove(topic: string, id: string): Promise<boolean> {
    this.rows.delete(`${topic}/${id}`);
    return Promise.resolve(this.removeAnswer);
  }

  override members(): Promise<string[]> {
    return Promise.resolve([...this.rows]);
  }

  override of(): Promise<string[]> {
    return Promise.resolve([...this.rows]);
  }

  override clear(): Promise<boolean> {
    this.rows.clear();
    return Promise.resolve(true);
  }

  override notify(id: string, topic: string, joined: boolean): Promise<boolean> {
    this.notified.push({ id, topic, joined });
    return Promise.resolve(true);
  }
}

function members(): { store: FakeStore; topics: TopicMembers } {
  const store = new FakeStore();
  return { store, topics: new TopicMembers(store) };
}

Deno.test("membership: joining notifies once", async () => {
  const { store, topics } = members();

  assertEquals(await topics.add("room", "u1"), true);
  assertEquals(store.notified, [{ id: "u1", topic: "room", joined: true }]);
});

Deno.test("membership: joining twice does not notify twice", async () => {
  const { store, topics } = members();

  await topics.add("room", "u1");
  assertEquals(await topics.add("room", "u1"), true);
  assertEquals(store.notified.length, 1);
});

Deno.test("membership: leaving a topic you never joined notifies nobody", async () => {
  const { store, topics } = members();

  assertEquals(await topics.remove("room", "u1"), false);
  assertEquals(store.notified, []);
});

Deno.test("membership: leaving notifies once", async () => {
  const { store, topics } = members();

  await topics.add("room", "u1");
  assertEquals(await topics.remove("room", "u1"), true);
  assertEquals(store.notified.at(-1), { id: "u1", topic: "room", joined: false });
});

Deno.test("membership: an unbroadcastable topic is refused at the door", async () => {
  const { store, topics } = members();

  assertEquals(await topics.add("bad topic!", "u1"), false);
  assertEquals(store.rows.size, 0);
  assertEquals(await topics.has("bad topic!", "u1"), false);
  assertEquals(await topics.members("bad topic!"), []);
});

Deno.test("membership: every topic-taking operation is guarded", async () => {
  const { store, topics } = members();
  await topics.add("room", "u1");

  assertEquals(await topics.add("bad topic", "u1"), false);
  assertEquals(await topics.remove("bad topic", "u1"), false);
  assertEquals(await topics.has("bad topic", "u1"), false);
  assertEquals(await topics.members("bad topic"), []);
  assertEquals(await topics.clear("bad topic"), false);
  assertEquals(store.rows.has("room/u1"), true);
});

Deno.test("membership: of() takes an account, so it has no topic to validate", async () => {
  const { store, topics } = members();
  store.rows.add("room/u1");

  assertEquals(await topics.of("u1"), ["room/u1"]);
});

Deno.test("membership: clear() wipes the topic and notifies nobody", async () => {
  const { store, topics } = members();
  await topics.add("room", "u1");
  await topics.add("room", "u2");
  const notifiedBefore = store.notified.length;

  assertEquals(await topics.clear("room"), true);
  assertEquals(store.rows.size, 0);
  assertEquals(store.notified.length, notifiedBefore);
});

Deno.test("membership: a store that refuses the write notifies nobody", async () => {
  const { store, topics } = members();
  store.rows.add("room/u1");
  store.removeAnswer = false;

  assertEquals(await topics.remove("room", "u1"), false);
  assertEquals(store.notified, []);
});

Deno.test("membership: has() reports the truth after each transition", async () => {
  const { topics } = members();

  assertEquals(await topics.has("room", "u1"), false);
  await topics.add("room", "u1");
  assertEquals(await topics.has("room", "u1"), true);
  await topics.remove("room", "u1");
  assertEquals(await topics.has("room", "u1"), false);
});
