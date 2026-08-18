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

// deno-lint-ignore-file no-explicit-any

import type { TypedQueryBuilder } from "@scribe/foundation/src/database/query/builder.ts";

const MAX_MEMBERS = 1_000;
const MAX_TOPICS_PER_ACCOUNT = 200;

export abstract class TopicStore {
  protected abstract query(): TypedQueryBuilder<any, any, any>;
  protected abstract get ownerColumn(): string;

  abstract notify(
    accountId: string,
    topic: string,
    joined: boolean,
  ): Promise<boolean>;

  add(topic: string, accountId: string): Promise<boolean> {
    return this.query().insert({ topic, [this.ownerColumn]: accountId });
  }

  async has(topic: string, accountId: string): Promise<boolean> {
    const row = await this.query()
      .selectRaw(this.ownerColumn)
      .where((f: any) => [
        f.topic.eq(topic),
        f[this.ownerColumn].eq(accountId),
      ])
      .getOne();
    return row !== null;
  }

  remove(topic: string, accountId: string): Promise<boolean> {
    return this.query()
      .where((f: any) => [
        f.topic.eq(topic),
        f[this.ownerColumn].eq(accountId),
      ])
      .delete();
  }

  async members(topic: string): Promise<string[]> {
    const rows = await this.query()
      .selectRaw(this.ownerColumn)
      .where((f: any) => f.topic.eq(topic))
      .limit(MAX_MEMBERS)
      .get();

    this.#warnIfCapped("members", topic, rows.length, MAX_MEMBERS);
    return rows.map((row: any) => String(row[this.ownerColumn]));
  }

  async of(accountId: string): Promise<string[]> {
    const rows = await this.query()
      .selectRaw("topic")
      .where((f: any) => f[this.ownerColumn].eq(accountId))
      .limit(MAX_TOPICS_PER_ACCOUNT)
      .get();

    this.#warnIfCapped("of", accountId, rows.length, MAX_TOPICS_PER_ACCOUNT);
    return rows.map((row: any) => String(row.topic));
  }

  #warnIfCapped(
    operation: string,
    subject: string,
    returned: number,
    cap: number,
  ): void {
    if (returned < cap) return;

    console.error(
      `[realtime:topics] ${operation} hit the ${cap} row cap for ${JSON.stringify(subject)}: the result is truncated.`,
    );
  }

  clear(topic: string): Promise<boolean> {
    return this.query()
      .where((f: any) => f.topic.eq(topic))
      .delete();
  }
}
