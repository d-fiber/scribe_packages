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
import type { LockCommands } from "@scribe/foundation/src/valkery/lock/release_script.ts";
import { type Kv, kv } from "@scribe/foundation/src/redis/mod.ts";
import { rateLimiter, type RateLimitResult } from "@scribe/core/runtime/redis/rate_limiter/mod.ts";
import { stub } from "@std/testing/mock";
import { type InstalledMock, installMock } from "@scribe/core/testing/install.ts";

/**
 * Replaces the raw Redis transport with two in-memory maps, and answers the handle that puts
 * the real client back.
 *
 * @remarks
 * What is stubbed is the transport, never `Valkery` itself: every subclass keeps running its
 * real get, set, lock and scan logic against the fake store, so a test exercises the caching
 * behavior rather than a second implementation of it written for the test.
 *
 * The store has two shapes because Redis keeps them apart too, strings for the entries the
 * cache writes and sets for the fingerprints `IdentityRevocation` indexes next to them.
 * Expiry is not simulated: a test that needs a key gone deletes it. `SET` is only ever
 * reached by the distributed lock, so the fake implements the `NX` half of it and ignores the
 * expiry that comes with it.
 */
export function installValkeryMock(): InstalledMock {
  const store = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  const mocks = [
    installMock(
      kv(),
      "get",
      ((key: string) => Promise.resolve(store.get(key) ?? null)) as unknown as Kv["get"],
    ),
    installMock(
      kv(),
      "setex",
      ((key: string, _seconds: number, value: string) => {
        store.set(key, value);
        return Promise.resolve("OK" as const);
      }) as unknown as Kv["setex"],
    ),
    installMock(
      kv(),
      "del",
      ((...keys: string[]) => {
        let deleted = 0;
        for (const key of keys) {
          if (store.delete(key)) deleted++;
          if (sets.delete(key)) deleted++;
        }
        return Promise.resolve(deleted);
      }) as unknown as Kv["del"],
    ),
    installMock(
      kv(),
      "mget",
      ((...keys: string[]) =>
        Promise.resolve(
          keys.map((key) => store.get(key) ?? null),
        )) as unknown as Kv["mget"],
    ),
    installMock(
      kv(),
      "unlink",
      ((...keys: string[]) => {
        let removed = 0;
        for (const key of keys) {
          if (store.delete(key)) removed++;
          if (sets.delete(key)) removed++;
        }
        return Promise.resolve(removed);
      }) as unknown as Kv["unlink"],
    ),
    installMock(
      kv(),
      "exists",
      ((...keys: string[]) =>
        Promise.resolve(
          keys.filter((key) => store.has(key) || sets.has(key)).length,
        )) as unknown as Kv["exists"],
    ),
    installMock(
      kv(),
      "sadd",
      ((key: string, ...members: string[]) => {
        const set = sets.get(key) ?? new Set<string>();
        const before = set.size;
        for (const member of members) set.add(member);
        sets.set(key, set);
        return Promise.resolve(set.size - before);
      }) as unknown as Kv["sadd"],
    ),
    installMock(
      kv(),
      "smembers",
      ((key: string) => Promise.resolve(Array.from(sets.get(key) ?? []))) as unknown as Kv["smembers"],
    ),
    installMock(
      kv(),
      "expire",
      ((key: string) => Promise.resolve(store.has(key) || sets.has(key) ? 1 : 0)) as unknown as Kv["expire"],
    ),
    installMock(
      kv(),
      "set",
      ((key: string, value: string) => {
        if (store.has(key)) return Promise.resolve(null);
        store.set(key, value);
        return Promise.resolve("OK" as const);
      }) as unknown as Kv["set"],
    ),
    installMock(
      kv(),
      "scan",
      ((_cursor: string, _match: string, pattern: string) => {
        const prefix = pattern.replace(/\*$/, "");
        const keys = Array.from(store.keys()).filter((k) => k.startsWith(prefix));
        return Promise.resolve(["0", keys] as [string, string[]]);
      }) as unknown as Kv["scan"],
    ),
    installMock(
      kv() as unknown as LockCommands,
      "releaseLock",
      (key: string, token: string) => {
        if (store.get(key) !== token) return Promise.resolve(0);
        store.delete(key);
        return Promise.resolve(1);
      },
    ),
  ];

  return {
    restore(): void {
      for (const mock of mocks) mock.restore();
    },
  };
}

/**
 * Makes `rateLimiter.check` answer `result` for every caller, and answers the handle that
 * puts the real limiter back.
 *
 * @param result - What every check answers. The default lets the caller through with a
 * remaining count high enough that no test has to think about it.
 */
export function installRateLimiterMock(
  result: RateLimitResult = { ok: true, remaining: 999 },
): InstalledMock {
  const stubbed = stub(
    rateLimiter,
    "check",
    () => Promise.resolve(result),
  );
  return { restore: () => stubbed.restore() };
}
