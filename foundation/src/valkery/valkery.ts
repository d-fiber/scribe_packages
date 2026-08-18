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
import { DEFAULT_BETA, shouldRefreshEarly } from "./early_expiry.ts";
import type { Entry } from "./entry.ts";
import { withJitter } from "./entry_ttl.ts";
import { DistributedFlight } from "./flight/distributed.ts";
import { LocalFlight } from "./flight/local.ts";
import { KeySpace } from "./key_space.ts";
import { DistributedLock } from "./lock/distributed_lock.ts";
import { ValkeryStore } from "./store.ts";

/**
 * A namespace of cached entries, with one ttl and one name.
 *
 * A subclass declares `key` and `ttl` and inherits everything else. Nothing here throws:
 * an unreachable Redis is reported and read as a miss, so a cache outage degrades into
 * recomputation rather than into an error the caller has to handle.
 */
export abstract class Valkery {
  /** The namespace every key of this cache is written under. */
  abstract get key(): string;

  /** How long an entry is served before it is recomputed. */
  abstract get ttl(): Time;

  /**
   * How eagerly a reader refreshes an entry that is close to expiring.
   *
   * Raising it refreshes earlier and more often, lowering it lets more readers arrive at
   * the expiry together. Zero turns refresh-ahead off and brings back a plain miss on
   * expiry. See {@link shouldRefreshEarly} for what the number does.
   */
  protected get beta(): number {
    return DEFAULT_BETA;
  }

  #keys: KeySpace | null = null;
  #store: ValkeryStore | null = null;
  #local: LocalFlight | null = null;
  #shared: DistributedFlight | null = null;

  /** The value cached under `id`, or `null` when nothing usable is cached. */
  async get<T>(id: string): Promise<T | null> {
    const entry = await this.store().read<T>(id, this.ttl.ms);
    return entry === null ? null : entry.value;
  }

  /**
   * The values cached under `ids`, in the order asked, `null` where nothing is cached.
   *
   * One round trip whatever the number of ids.
   */
  async getMany<T>(ids: readonly string[]): Promise<(T | null)[]> {
    const entries = await this.store().readMany<T>(ids, this.ttl.ms);
    return entries.map((entry) => (entry === null ? null : entry.value));
  }

  /** Caches `value` under `id` for this cache's ttl. */
  async add<T>(id: string, value: T): Promise<void> {
    if (!this.#usableTtl(`for key "${id}"`)) return;

    await this.store().write(id, value, withJitter(this.ttl), 0);
  }

  /** Caches several values in a single pipeline. */
  async addMany<T>(entries: [string, T][]): Promise<void> {
    if (entries.length === 0) return;
    if (!this.#usableTtl("")) return;

    await this.store().writeMany(entries, () => withJitter(this.ttl));
  }

  /** Removes what is cached under `id`. */
  delete(id: string): Promise<void> {
    return this.store().forget([id]);
  }

  /** Removes what is cached under each of `ids`. */
  deleteMany(...ids: string[]): Promise<void> {
    return this.store().forget(ids);
  }

  /**
   * The value cached under `id`, computing and caching it when it is missing or stale.
   *
   * Three things happen here that a plain read-then-write does not do, and each one closes
   * a way for the same computation to run more than it has to:
   *
   * - concurrent callers **in this process** share one run, before any round trip;
   * - callers **across replicas** are coordinated by a Redis lock, so one of them computes
   *   and the others read what it wrote;
   * - an entry close to expiring is refreshed by whoever draws it **while the old value is
   *   still served**, so nobody waits on an expiry.
   *
   * @param id - The key inside this cache's namespace.
   * @param compute - Produces the value on a miss. Called at most once per process per key.
   */
  upsert<T>(id: string, compute: () => Promise<T>): Promise<T> {
    // The local flight keys on the namespaced key rather than on the id, because two caches
    // hand out the same ids and must not share a run.
    return this.local().run(this.keySpace().keyOf(id), async () => {
      const entry = await this.store().read<T>(id, this.ttl.ms);

      if (entry !== null) {
        if (!shouldRefreshEarly(entry, this.beta)) return entry.value;
        return await this.#refreshAhead(id, entry, compute);
      }

      return await this.#fill(id, compute);
    });
  }

  /** Removes every entry of this cache, or those a glob matches inside it. */
  clear(pattern?: string): Promise<void> {
    return this.store().sweep(this.keySpace().matching(pattern));
  }

  /** Reports a failed cache operation. Overridden by a subclass that logs differently. */
  protected report(operation: string, error: unknown): void {
    console.error(
      `[valkery:${this.key}] ${operation} failed, bypassing valkery:`,
      error,
    );
  }

  /** The key derivation of this cache. Lazily built, so a subclass can compute its `key`. */
  protected keySpace(): KeySpace {
    return (this.#keys ??= new KeySpace(this.key));
  }

  /** The Redis calls of this cache, guarded. */
  protected store(): ValkeryStore {
    return (this.#store ??= new ValkeryStore(
      this.keySpace(),
      (operation, error) => this.report(operation, error),
    ));
  }

  /** The in-process flight of this cache. */
  protected local(): LocalFlight {
    return (this.#local ??= new LocalFlight());
  }

  /** The cross-replica flight of this cache. */
  protected shared(): DistributedFlight {
    return (this.#shared ??= new DistributedFlight(
      new DistributedLock((operation, error) => this.report(operation, error)),
      (id) =>
        this.report(
          "upsert",
          new Error(`gave up coordinating on "${id}", computing without lock`),
        ),
    ));
  }

  // Nothing is cached and something has to produce the value now, so a loser waits for the
  // winner: there is no older value to hand it in the meantime.
  #fill<T>(id: string, compute: () => Promise<T>): Promise<T> {
    return this.shared().run(
      id,
      this.keySpace().lockKeyOf(id),
      () => this.get<T>(id),
      () => this.#computeAndWrite(id, compute),
    );
  }

  // A value is still being served, so a loser takes it rather than waiting, and a failed
  // recompute serves it too: a cache that already holds an answer must not turn a flaky
  // origin into an error.
  async #refreshAhead<T>(
    id: string,
    entry: Entry<T>,
    compute: () => Promise<T>,
  ): Promise<T> {
    try {
      const refreshed = await this.shared().attempt(
        this.keySpace().lockKeyOf(id),
        () => this.#computeAndWrite(id, compute),
      );
      return refreshed ?? entry.value;
    } catch (error) {
      this.report("refresh", error);
      return entry.value;
    }
  }

  // The cost of the computation is measured here and stored with the value, because it is
  // what decides how early the next readers volunteer to refresh it.
  async #computeAndWrite<T>(id: string, compute: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    const value = await compute();
    const computeMs = Date.now() - startedAt;

    if (this.#usableTtl(`for key "${id}"`)) {
      await this.store().write(id, value, withJitter(this.ttl), computeMs);
    }
    return value;
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
