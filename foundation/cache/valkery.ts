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

import type { Time } from "@scribe/core/contracts/common/time.ts";
import { kv } from "@scribe/core/runtime/redis/mod.ts";
import { withJitter } from "./entry_ttl.ts";
import { KeySpace } from "./key_space.ts";
import { DistributedLock } from "./lock/distributed_lock.ts";
import { SingleFlight } from "./single_flight.ts";

export abstract class Valkery {
  abstract get key(): string;
  abstract get ttl(): Time;

  #keys: KeySpace | null = null;
  #flight: SingleFlight | null = null;

  async get<T>(id: string): Promise<T | null> {
    try {
      const raw = await kv().get(this.#keySpace().keyOf(id));
      return raw !== null ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.report("get", error);
      return null;
    }
  }

  async add<T>(id: string, value: T): Promise<void> {
    if (!this.#usableTtl(`for key "${id}"`)) return;

    try {
      await kv().setex(
        this.#keySpace().keyOf(id),
        withJitter(this.ttl),
        JSON.stringify(value),
      );
    } catch (error) {
      this.report("set", error);
    }
  }

  async addMany<T>(entries: [string, T][]): Promise<void> {
    if (entries.length === 0) return;
    if (!this.#usableTtl("")) return;

    try {
      const pipeline = kv().pipeline();
      for (const [id, value] of entries) {
        pipeline.setex(
          this.#keySpace().keyOf(id),
          withJitter(this.ttl),
          JSON.stringify(value),
        );
      }
      await pipeline.exec();
    } catch (error) {
      this.report("set", error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await kv().del(this.#keySpace().keyOf(id));
    } catch (error) {
      this.report("del", error);
    }
  }

  async deleteMany(...ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    try {
      await kv().del(...ids.map((id) => this.#keySpace().keyOf(id)));
    } catch (error) {
      this.report("del", error);
    }
  }

  async upsert<T>(id: string, compute: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(id);
    if (cached !== null) return cached;

    return this.#singleFlight().run(
      id,
      this.#keySpace().lockKeyOf(id),
      {
        read: () => this.get<T>(id),
        write: (value: T) => this.add(id, value),
      },
      compute,
    );
  }

  async clear(pattern?: string): Promise<void> {
    const match = this.#keySpace().matching(pattern);

    try {
      let cursor = "0";
      do {
        const [next, ids] = await kv().scan(
          cursor,
          "MATCH",
          match,
          "COUNT",
          100,
        );
        cursor = next;
        if (ids.length > 0) await kv().del(...ids);
      } while (cursor !== "0");
    } catch (error) {
      this.report("clear", error);
    }
  }

  protected report(operation: string, error: unknown): void {
    console.error(
      `[valkery:${this.key}] ${operation} failed, bypassing cache:`,
      error,
    );
  }

  #keySpace(): KeySpace {
    return (this.#keys ??= new KeySpace(this.key));
  }

  #singleFlight(): SingleFlight {
    return (this.#flight ??= new SingleFlight(
      new DistributedLock((operation, error) => this.report(operation, error)),
      (id) =>
        this.report(
          "upsert",
          new Error(`gave up coordinating on "${id}", computing without lock`),
        ),
    ));
  }

  #usableTtl(context: string): boolean {
    if (this.ttl.value > 0) return true;

    this.report(
      "set",
      new Error(`invalid ttl ${this.ttl.value} ${context}`.trimEnd()),
    );
    return false;
  }
}
