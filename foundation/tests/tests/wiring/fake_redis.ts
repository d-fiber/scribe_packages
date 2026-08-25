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

import type { LockCommands } from "../../../lib/src/cache/lock/lock_commands.ts";
import { type Kv, kv } from "../../../lib/src/redis/kv.ts";
import { type InstalledMock, installMock } from "../../testing/install.ts";

export interface FakeRedis extends InstalledMock {
  readonly calls: string[];
  readonly store: Map<string, string>;
  roundTrips(): number;
  countOf(command: string): number;
  forget(): void;
}

interface Pipelined {
  setex(key: string, seconds: number, value: string): Pipelined;
  exec(): Promise<unknown[]>;
}

export function installFakeRedis(): FakeRedis {
  const store = new Map<string, string>();
  const calls: string[] = [];
  const client = kv();

  const record = <T>(command: string, answer: T): T => {
    calls.push(command);
    return answer;
  };

  const installed = [
    installMock(
      client,
      "get",
      ((key: string) => Promise.resolve(record("get", store.get(key) ?? null))) as unknown as Kv["get"],
    ),
    installMock(
      client,
      "mget",
      ((...keys: string[]) =>
        Promise.resolve(record("mget", keys.map((key) => store.get(key) ?? null)))) as unknown as Kv["mget"],
    ),
    installMock(
      client,
      "setex",
      ((key: string, _seconds: number, value: string) => {
        store.set(key, value);
        return Promise.resolve(record("setex", "OK" as const));
      }) as unknown as Kv["setex"],
    ),
    installMock(
      client,
      "unlink",
      ((...keys: string[]) => {
        let removed = 0;
        for (const key of keys) if (store.delete(key)) removed++;
        return Promise.resolve(record("unlink", removed));
      }) as unknown as Kv["unlink"],
    ),
    installMock(
      client,
      "del",
      ((...keys: string[]) => {
        let removed = 0;
        for (const key of keys) if (store.delete(key)) removed++;
        return Promise.resolve(record("del", removed));
      }) as unknown as Kv["del"],
    ),
    installMock(
      client,
      "set",
      ((key: string, value: string, ..._rest: unknown[]) => {
        if (store.has(key)) return Promise.resolve(record("set", null));
        store.set(key, value);
        return Promise.resolve(record("set", "OK" as const));
      }) as unknown as Kv["set"],
    ),
    installMock(
      client,
      "pttl",
      ((_key: string) => Promise.resolve(record("pttl", -1))) as unknown as Kv["pttl"],
    ),
    installMock(
      client,
      "scan",
      ((_cursor: string, _match: string, pattern: string) => {
        const prefix = pattern.replace(/\*$/, "");
        const keys = [...store.keys()].filter((key) => key.startsWith(prefix));
        return Promise.resolve(record("scan", ["0", keys] as [string, string[]]));
      }) as unknown as Kv["scan"],
    ),
    installMock(
      client,
      "pipeline",
      (() => {
        const staged: Array<[string, string]> = [];
        const chain: Pipelined = {
          setex(key: string, _seconds: number, value: string): Pipelined {
            staged.push([key, value]);
            return chain;
          },
          exec(): Promise<unknown[]> {
            for (const [key, value] of staged) store.set(key, value);
            return Promise.resolve(record("pipeline", staged.map(() => [null, "OK"])));
          },
        };
        return chain;
      }) as unknown as Kv["pipeline"],
    ),
    installMock(
      client as unknown as LockCommands,
      "releaseLock",
      (key: string, token: string) => {
        if (store.get(key) !== token) return Promise.resolve(record("releaseLock", 0));
        store.delete(key);
        return Promise.resolve(record("releaseLock", 1));
      },
    ),
  ];

  return {
    calls,
    store,
    roundTrips(): number {
      return calls.length;
    },
    countOf(command: string): number {
      return calls.filter((call) => call === command).length;
    },
    forget(): void {
      calls.length = 0;
      store.clear();
    },
    restore(): void {
      for (const one of installed) one.restore();
    },
  };
}
