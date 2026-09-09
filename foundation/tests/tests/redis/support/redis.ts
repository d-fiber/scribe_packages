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
import { type Kv, kv } from "../../../../lib/src/redis/kv.ts";
import { type InstalledMock, installMock } from "../../../testing/install.ts";

/** A stand-in for the store `KeyIndex`, `RedisClaims` and `IdentityRevocation` share. */
export interface FakeRedis extends InstalledMock {
  /** The name of every command this fake has answered so far, in the order it received them. */
  readonly calls: string[];

  /** How many of the recorded calls were named `command`. */
  countOf(command: string): number;

  /** The value held under `key`, or null when it is absent or expired. */
  raw(key: string): string | null;

  /** Seconds until `key` expires, or null when it never will or is absent. */
  ttlOf(key: string): number | null;

  /** Makes the next call to command `name` throw `error` instead of answering. */
  failNext(name: string, error: Error): void;

  /** Empties {@link calls}, so a test can assert on what happens next without counting setup calls. */
  forget(): void;
}

interface Held {
  value: string;
  expiresAtSeconds: number | null;
}

/**
 * Patches the shared `kv()` client's own commands the way `cache/support/redis.ts` does, with the
 * set the redis internals reach for instead of the cache's: `sadd`, `smembers` and `expire` on top
 * of `set`, `setex`, `del`, `unlink` and `exists`.
 */
export function installFakeRedis(): FakeRedis {
  const held = new Map<string, Held>();
  const sets = new Map<string, Set<string>>();
  const setExpiresAtSeconds = new Map<string, number>();
  const calls: string[] = [];
  const failures = new Map<string, Error>();

  const now = (): number => Date.now() / 1000;

  const alive = (key: string): Held | null => {
    const one = held.get(key);
    if (one === undefined) return null;
    if (one.expiresAtSeconds !== null && now() >= one.expiresAtSeconds) {
      held.delete(key);
      return null;
    }
    return one;
  };

  const record = (name: string): void => {
    calls.push(name);
    const failure = failures.get(name);
    if (failure !== undefined) {
      failures.delete(name);
      throw failure;
    }
  };

  const readOption = (args: unknown[], flag: string): unknown => {
    const at = args.findIndex((one) => String(one).toUpperCase() === flag);
    return at === -1 ? undefined : args[at + 1];
  };

  const client = kv();

  const installed: InstalledMock[] = [
    installMock(
      client,
      "set",
      ((key: string, value: string, ...rest: unknown[]) => {
        record("set");
        const exclusive = rest.some((one) => String(one).toUpperCase() === "NX");
        if (exclusive && alive(key) !== null) return Promise.resolve(null);

        const ex = readOption(rest, "EX");
        const px = readOption(rest, "PX");
        const livesFor = ex !== undefined ? Number(ex) : px !== undefined ? Number(px) / 1_000 : null;
        held.set(key, {
          value,
          expiresAtSeconds: livesFor === null ? null : now() + livesFor,
        });
        return Promise.resolve("OK" as const);
      }) as unknown as Kv["set"],
    ),
    installMock(
      client,
      "setex",
      ((key: string, seconds: number, value: string) => {
        record("setex");
        held.set(key, { value, expiresAtSeconds: now() + seconds });
        return Promise.resolve("OK" as const);
      }) as unknown as Kv["setex"],
    ),
    installMock(
      client,
      "del",
      ((...keys: string[]) => {
        record("del");
        let removed = 0;
        for (const key of keys) {
          if (alive(key) !== null || sets.has(key)) removed++;
          held.delete(key);
          sets.delete(key);
          setExpiresAtSeconds.delete(key);
        }
        return Promise.resolve(removed);
      }) as unknown as Kv["del"],
    ),
    installMock(
      client,
      "unlink",
      ((...keys: string[]) => {
        record("unlink");
        let removed = 0;
        for (const key of keys) {
          if (alive(key) !== null || sets.has(key)) removed++;
          held.delete(key);
          sets.delete(key);
          setExpiresAtSeconds.delete(key);
        }
        return Promise.resolve(removed);
      }) as unknown as Kv["unlink"],
    ),
    installMock(
      client,
      "exists",
      ((...keys: string[]) => {
        record("exists");
        return Promise.resolve(
          keys.filter((key) => alive(key) !== null).length,
        );
      }) as unknown as Kv["exists"],
    ),
    installMock(
      client,
      "sadd",
      ((key: string, ...members: string[]) => {
        record("sadd");
        const set = sets.get(key) ?? new Set<string>();
        const before = set.size;
        for (const member of members) set.add(member);
        sets.set(key, set);
        return Promise.resolve(set.size - before);
      }) as unknown as Kv["sadd"],
    ),
    installMock(
      client,
      "smembers",
      ((key: string) => {
        record("smembers");
        return Promise.resolve(Array.from(sets.get(key) ?? []));
      }) as unknown as Kv["smembers"],
    ),
    installMock(
      client,
      "expire",
      ((key: string, seconds: number) => {
        record("expire");
        const heldEntry = held.get(key);
        if (heldEntry !== undefined) {
          heldEntry.expiresAtSeconds = now() + seconds;
          return Promise.resolve(1);
        }
        if (sets.has(key)) {
          setExpiresAtSeconds.set(key, now() + seconds);
          return Promise.resolve(1);
        }
        return Promise.resolve(0);
      }) as unknown as Kv["expire"],
    ),
  ];

  return {
    calls,
    countOf(command: string): number {
      return calls.filter((call) => call === command).length;
    },
    raw(key: string): string | null {
      return alive(key)?.value ?? null;
    },
    ttlOf(key: string): number | null {
      const one = alive(key);
      if (one !== null && one.expiresAtSeconds !== null) {
        return one.expiresAtSeconds - now();
      }

      const setExpiry = setExpiresAtSeconds.get(key);
      return setExpiry === undefined ? null : setExpiry - now();
    },
    failNext(name: string, error: Error): void {
      failures.set(name, error);
    },
    forget(): void {
      calls.length = 0;
    },
    restore(): void {
      for (const one of installed) one.restore();
    },
  };
}
