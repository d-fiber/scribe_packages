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

import { Duration } from "@scribe/alchemy";
import { DEFAULT_BETA, shouldRefreshEarly } from "./early_expiry.ts";
import type { Entry } from "./entry.ts";
import { withJitter } from "./entry_ttl.ts";
import { DistributedFlight } from "./flight/distributed.ts";
import { LocalFlight } from "./flight/local.ts";
import { KeySpace } from "./key_space.ts";
import { DistributedLock } from "./lock/distributed_lock.ts";
import { ValkeryStore } from "./store.ts";

/**
 * What declaring a cache takes.
 *
 * Only the namespace is required. Everything else has an answer that is right far more often
 * than it is wrong, and an option nobody passes is an option that goes stale unnoticed.
 */
export interface ValkeryOptions {
  /** The namespace every key of this cache is written under. */
  readonly key: string;

  /**
   * How long an entry is served before it is recomputed.
   *
   * Left out, it is {@link DEFAULT_TTL}. That is long, and deliberately so: a cache is
   * correct at any ttl and only its freshness changes, so the default is the one that costs
   * the origin least. A namespace whose values go stale says how fast.
   */
  readonly ttl?: Duration;

  /**
   * How eagerly a reader refreshes an entry that is close to expiring.
   *
   * Raising it refreshes earlier and more often, lowering it lets more readers arrive at the
   * expiry together. Zero turns refresh-ahead off and brings back a plain miss on expiry. See
   * {@link shouldRefreshEarly} for what the number does.
   */
  readonly beta?: number;
}

/**
 * How long an entry lives when its declaration does not say.
 *
 * Fifteen days.
 */
export const DEFAULT_TTL: Duration = Duration.days(15);

/**
 * A namespace of cached entries, with one name, one ttl and one value type.
 *
 * ```ts
 * const sessions = new Valkery<Session>({ key: "session", ttl: Duration.minutes(5) });
 *
 * await sessions.add("u1", session);   // only a Session goes in
 * const found = await sessions.get("u1");  // Session | null comes out
 * ```
 *
 * `T` sits on the class rather than on each method on purpose. A cache holds one kind of
 * thing, so the type is a property of the namespace and belongs where the namespace is
 * declared: written once, checked at every call, and impossible for two call sites to
 * disagree on. A namespace that genuinely holds several shapes declares `unknown` and says so.
 *
 * A cache is **configured, not extended**: there is nothing to subclass and nothing to
 * override, which is what keeps every namespace of the fleet behaving the same way.
 *
 * Nothing here throws: an unreachable Redis is reported and read as a miss, so a cache outage
 * degrades into recomputation rather than into an error the caller has to handle.
 */
export class Valkery<T> {
  /** The namespace every key of this cache is written under. */
  readonly key: string;

  /** How long an entry is served before it is recomputed. */
  readonly ttl: Duration;

  readonly #beta: number;

  constructor(options: ValkeryOptions) {
    this.key = options.key;
    this.ttl = options.ttl ?? DEFAULT_TTL;
    this.#beta = options.beta ?? DEFAULT_BETA;
  }

  #keysMemo: KeySpace | null = null;
  #storeMemo: ValkeryStore | null = null;
  #localMemo: LocalFlight | null = null;
  #sharedMemo: DistributedFlight | null = null;

  /** The value cached under `id`, or `null` when nothing usable is cached. */
  async get(id: string): Promise<T | null> {
    const entry = await this.#store().read<T>(id, this.ttl.inMilliseconds);
    return entry === null ? null : entry.value;
  }

  /**
   * The values cached under `ids`, in the order asked, `null` where nothing is cached.
   *
   * One round trip whatever the number of ids.
   */
  async getMany(ids: readonly string[]): Promise<(T | null)[]> {
    const entries = await this.#store().readMany<T>(ids, this.ttl.inMilliseconds);
    return entries.map((entry) => (entry === null ? null : entry.value));
  }

  /** Caches `value` under `id` for this cache's ttl. */
  async add(id: string, value: T): Promise<void> {
    if (!this.#usableTtl(`for key "${id}"`)) return;

    await this.#store().write(id, value, withJitter(this.ttl), 0);
  }

  /** Caches several values in a single pipeline. */
  async addMany(entries: [string, T][]): Promise<void> {
    if (entries.length === 0) return;
    if (!this.#usableTtl("")) return;

    await this.#store().writeMany(entries, () => withJitter(this.ttl));
  }

  /** Removes what is cached under `id`. */
  delete(id: string): Promise<void> {
    return this.#store().forget([id]);
  }

  /** Removes what is cached under each of `ids`. */
  deleteMany(...ids: string[]): Promise<void> {
    return this.#store().forget(ids);
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
   * The local flight keys on the namespaced key rather than on the id, because two caches hand
   * out the same ids and must not share a run.
   *
   * @param id - The key inside this cache's namespace.
   * @param compute - Produces the value on a miss. Called at most once per process per key.
   */
  upsert(id: string, compute: () => Promise<T>): Promise<T> {
    return this.#local().run(this.#keySpace().keyOf(id), async () => {
      const entry = await this.#store().read<T>(id, this.ttl.inMilliseconds);

      if (entry !== null) {
        if (!shouldRefreshEarly(entry, this.#beta)) return entry.value;
        return await this.#refreshAhead(id, entry, compute);
      }

      return await this.#fill(id, compute);
    });
  }

  /** Removes every entry of this cache, or those a glob matches inside it. */
  clear(pattern?: string): Promise<void> {
    return this.#store().sweep(this.#keySpace().matching(pattern));
  }

  /**
   * Logs a failed operation and lets the caller carry on without the cache.
   *
   * Every failure of every operation lands here, which is what makes the whole cache fail-open
   * in one place rather than in a catch per method.
   */
  #report(operation: string, error: unknown): void {
    console.error(
      `[valkery:${this.key}] ${operation} failed, bypassing valkery:`,
      error,
    );
  }

  #keySpace(): KeySpace {
    return (this.#keysMemo ??= new KeySpace(this.key));
  }

  #store(): ValkeryStore {
    return (this.#storeMemo ??= new ValkeryStore(
      this.#keySpace(),
      (operation, error) => this.#report(operation, error),
    ));
  }

  #local(): LocalFlight {
    return (this.#localMemo ??= new LocalFlight());
  }

  #shared(): DistributedFlight {
    return (this.#sharedMemo ??= new DistributedFlight(
      new DistributedLock((operation, error) => this.#report(operation, error)),
      (id) =>
        this.#report(
          "upsert",
          new Error(`gave up coordinating on "${id}", computing without lock`),
        ),
    ));
  }

  /**
   * Produces and stores the value of a key nothing holds yet.
   *
   * A loser waits for the winner here, because there is no older value to hand it in the
   * meantime.
   */
  #fill(id: string, compute: () => Promise<T>): Promise<T> {
    return this.#shared().run(
      id,
      this.#keySpace().lockKeyOf(id),
      () => this.get(id),
      () => this.#computeAndWrite(id, compute),
    );
  }

  /**
   * Recomputes an entry that is close to expiring, while the old value keeps being served.
   *
   * A loser takes the old value rather than waiting, and a failed recompute serves it too: a
   * cache that already holds an answer must not turn a flaky origin into an error.
   */
  async #refreshAhead(
    id: string,
    entry: Entry<T>,
    compute: () => Promise<T>,
  ): Promise<T> {
    try {
      const refreshed = await this.#shared().attempt(
        this.#keySpace().lockKeyOf(id),
        () => this.#computeAndWrite(id, compute),
      );
      return refreshed ?? entry.value;
    } catch (error) {
      this.#report("refresh", error);
      return entry.value;
    }
  }

  /**
   * Runs `compute`, stores what it produced, and answers it.
   *
   * The cost of the computation is measured here and stored with the value, because it is what
   * decides how early the next readers volunteer to refresh it.
   */
  async #computeAndWrite(id: string, compute: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    const value = await compute();
    const computeMs = Date.now() - startedAt;

    if (this.#usableTtl(`for key "${id}"`)) {
      await this.#store().write(id, value, withJitter(this.ttl), computeMs);
    }
    return value;
  }

  #usableTtl(context: string): boolean {
    if (this.ttl.inSeconds > 0) return true;

    this.#report(
      "set",
      new Error(`invalid ttl ${this.ttl.inSeconds} ${context}`.trimEnd()),
    );
    return false;
  }
}
