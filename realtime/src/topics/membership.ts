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

import { isValidTopic } from "../core/name.ts";
import { AdminTopicStore } from "./admin_store.ts";
import type { TopicStore } from "./store.ts";
import { UserTopicStore } from "./user_store.ts";

export class TopicMembers {
  readonly #store: TopicStore;

  constructor(store: TopicStore) {
    this.#store = store;
  }

  async add(topic: string, accountId: string): Promise<boolean> {
    if (!this.#accepts("add", topic)) return false;
    if (await this.#store.has(topic, accountId)) return true;

    const added = await this.#store.add(topic, accountId);
    if (added) await this.#store.notify(accountId, topic, true);
    return added;
  }

  async remove(topic: string, accountId: string): Promise<boolean> {
    if (!this.#accepts("remove", topic)) return false;
    if (!(await this.#store.has(topic, accountId))) return false;

    const removed = await this.#store.remove(topic, accountId);
    if (removed) await this.#store.notify(accountId, topic, false);
    return removed;
  }

  has(topic: string, accountId: string): Promise<boolean> {
    if (!this.#accepts("has", topic)) return Promise.resolve(false);
    return this.#store.has(topic, accountId);
  }

  members(topic: string): Promise<string[]> {
    if (!this.#accepts("members", topic)) return Promise.resolve([]);
    return this.#store.members(topic);
  }

  of(accountId: string): Promise<string[]> {
    return this.#store.of(accountId);
  }

  clear(topic: string): Promise<boolean> {
    if (!this.#accepts("clear", topic)) return Promise.resolve(false);
    return this.#store.clear(topic);
  }

  #accepts(operation: string, topic: string): boolean {
    if (isValidTopic(topic)) return true;

    console.error(
      `[realtime:topics] ${operation} refused, invalid topic: ${JSON.stringify(topic)}`,
    );
    return false;
  }
}

export class TopicMembership {
  readonly users: TopicMembers = new TopicMembers(new UserTopicStore());
  readonly admins: TopicMembers = new TopicMembers(new AdminTopicStore());
}
