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

import {
  type CacheOptions,
  DEFAULT_CACHE_DEADLINE,
  Duration,
  type Future,
  Stopwatch,
  type UnmodifiableList,
} from "@scribe/alchemy";
import { log } from "@scribe/alchemy/observe";
import { DEFAULT_BETA, shouldRefreshEarly } from "./early_expiry.ts";
import type { CacheEntry } from "./cache_entry.ts";
import { withJitter } from "./ttl_jitter.ts";
import { DistributedFlight } from "./flight/distributed_flight.ts";
import { LocalFlight } from "./flight/local_flight.ts";
import { KeySpace } from "./key_space.ts";
import { DistributedLock } from "./lock/distributed_lock.ts";
import { RedisCacheStore } from "./redis_cache_store.ts";

/**
 * What declaring a cache takes.
 *
 * Only the namespace is required. Everything else has an answer that is right far more often
 * than it is wrong, and an option nobody passes is an option that goes stale unnoticed.
 */
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
 * const sessions = new RedisCache<Session>({ key: "session", ttl: Duration.minutes(5) });
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
export class RedisCache<in out T> {
  /** The namespace every key of this cache is written under. */
  readonly key: string;

  /**
   * How long an entry is served before it is recomputed.
   *
   * @remarks
   * It follows the latest declaration of this key rather than the first. The port promises one
   * store per key, so two declarations cannot both be honoured, and reading the newest is what
   * makes a declaration mean something wherever it is written. Every conflict is recorded by
   * {@link RedisCaches}, because either answer is wrong for one of the two packages.
   */
  ttl: Duration;

  readonly #beta: number;

  /**
   * How long one call to this cache has, which is also what bounds a loser's wait.
   *
   * @remarks
   * The port applies it to the call it hands out. This copy is what a coordination loop reads:
   * a replica that lost the lock must stop waiting when the caller has stopped waiting, and the
   * caller's budget is the only quantity that says when that is.
   */
  readonly #within: Duration;

  constructor(options: CacheOptions) {
    this.key = options.key;
    this.ttl = options.ttl ?? DEFAULT_TTL;
    this.#beta = options.beta ?? DEFAULT_BETA;
    this.#within = options.deadline ?? DEFAULT_CACHE_DEADLINE;
  }

  #keysMemo: KeySpace | null = null;
  #storeMemo: RedisCacheStore | null = null;
  #sharedMemo: DistributedFlight | null = null;

  /** The value cached under `id`, or `null` when nothing usable is cached. */
  async get(id: string): Future<T | null> {
    const entry = await this.#store().read<T>(id, this.ttl.inMilliseconds);
    return entry === null ? null : entry.value;
  }

  /**
   * The values cached under `ids`, in the order asked, `null` where nothing is cached.
   *
   * One round trip whatever the number of ids.
   */
  async getMany(ids: UnmodifiableList<string>): Future<(T | null)[]> {
    const entries = await this.#store().readMany<T>(ids, this.ttl.inMilliseconds);
    return entries.map((entry) => (entry === null ? null : entry.value));
  }

  /** Caches `value` under `id` for this cache's ttl. */
  async add(id: string, value: T): Future<void> {
    if (!this.#usableTtl(`for key "${id}"`)) return;

    await this.#store().write(id, value, withJitter(this.ttl), 0);
  }

  /** Caches several values in a single pipeline. */
  async addMany(entries: [string, T][]): Future<void> {
    if (entries.length === 0) return;
    if (!this.#usableTtl("")) return;

    await this.#store().writeMany(entries, () => withJitter(this.ttl));
  }

  /** Removes what is cached under `id`. */
  delete(id: string): Future<void> {
    return this.#store().forget([id]);
  }

  /** Removes what is cached under each of `ids`. */
  deleteMany(...ids: string[]): Future<void> {
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
  upsert(id: string, compute: () => Future<T>): Future<T> {
    return this.#local().run(this.#keySpace().keyOf(id), async () => {
      const entry = await this.#store().read<T>(id, this.ttl.inMilliseconds);

      if (entry !== null) {
        if (!shouldRefreshEarly(entry, this.#beta)) return entry.value;
        return this.#refreshAhead(id, entry, compute);
      }

      return await this.#fill(id, compute);
    }, this.#within);
  }

  /** Removes every entry of this cache, or those a glob matches inside it. */
  clear(pattern?: string): Future<void> {
    return this.#store().sweep(this.#keySpace().matching(pattern));
  }

  /**
   * Logs a failed operation and lets the caller carry on without the cache.
   *
   * Every failure of every operation lands here, which is what makes the whole cache fail-open
   * in one place rather than in a catch per method.
   */
  #report(operation: string, error: unknown): void {
    log.error("cache.operation_failed", {
      metadata: { cache: this.key, operation, consequence: "the caller carries on without the cache", error },
    });
  }

  #keySpace(): KeySpace {
    return (this.#keysMemo ??= new KeySpace(this.key));
  }

  #store(): RedisCacheStore {
    return (this.#storeMemo ??= new RedisCacheStore(
      this.#keySpace(),
      (operation, error) => this.#report(operation, error),
    ));
  }

  #local(): LocalFlight {
    return _flight;
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
  #fill(id: string, compute: () => Future<T>): Future<T> {
    return this.#shared().run(
      id,
      this.#keySpace().lockKeyOf(id),
      () => this.get(id),
      () => this.#computeAndWrite(id, compute),
      this.#within,
    );
  }

  /**
   * Recomputes an entry that is close to expiring, while the old value keeps being served.
   *
   * @remarks
   * The recompute is not waited on. The rule exists so that nobody waits on an expiry, and a
   * reader that drew the refresh and then waited for it would be the one caller the rule makes
   * slower: with half a second of computation under a one second ttl that is two reads in five.
   * The old value is in hand, so it is answered and the recompute runs on its own.
   *
   * Nothing is thrown here for the same reason. A cache that already holds an answer must not
   * turn a flaky origin into an error, so a failed recompute is recorded and the entry stands
   * until it expires.
   */
  #refreshAhead(
    id: string,
    entry: CacheEntry<T>,
    compute: () => Future<T>,
  ): T {
    const running = this.#shared()
      .attempt(this.#keySpace().lockKeyOf(id), () => this.#computeAndWrite(id, compute))
      .catch((error: unknown) => this.#report("refresh", error))
      .finally(() => void _refreshing.delete(running));

    _refreshing.add(running);
    return entry.value;
  }

  /**
   * Runs `compute`, stores what it produced, and answers it.
   *
   * The cost of the computation is measured here and stored with the value, because it is what
   * decides how early the next readers volunteer to refresh it.
   */
  async #computeAndWrite(id: string, compute: () => Future<T>): Future<T> {
    const spent = new Stopwatch();
    spent.start();
    const value = await compute();
    spent.stop();

    if (this.#usableTtl(`for key "${id}"`)) {
      await this.#store().write(id, value, withJitter(this.ttl), spent.elapsed.inMilliseconds);
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

/**
 * The in-process coordination every cache of this process shares.
 *
 * @remarks
 * It is one flight and not one per store, because it keys on the namespaced key and because two
 * stores opened on the same key are the same cache. Held per instance it coordinated nothing the
 * moment a process built the store twice, and fifty replicas of one key each took their own lock
 * to find out that one of them was already refreshing.
 */
const _flight: LocalFlight = new LocalFlight();

/**
 * The refreshes running on their own right now, so a process can wait for them.
 *
 * @remarks
 * A refresh ahead of an expiry is not waited on by the reader that drew it, which is what keeps
 * that reader as fast as every other. Something still has to be able to wait: a process shutting
 * down would otherwise drop a value it has already paid for, and a test would end while a
 * recompute is still in flight.
 */
const _refreshing: Set<Promise<unknown>> = new Set();

/**
 * Waits for every refresh this process started on its own.
 *
 * @remarks
 * A refresh started while this waits is waited for too, so a chain of them drains rather than
 * leaving the last one behind.
 */
export async function refreshesSettled(): Future<void> {
  while (_refreshing.size > 0) await Promise.all([..._refreshing]);
}
