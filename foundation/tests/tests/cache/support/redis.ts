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

import "../../../testing/settings.ts";

import { DateTime } from "@scribe/alchemy";
import type { LockCommands } from "../../../../lib/src/cache/lock/lock_commands.ts";
import { type Kv, kv } from "../../../../lib/src/redis/kv.ts";
import { type InstalledMock, installMock } from "../../../testing/install.ts";

export interface Command {
  /** The Redis command name, exactly as the client sent it. */
  readonly name: string;

  /** The arguments the command was called with, in the order the client gave them. */
  readonly args: readonly unknown[];
}

export interface FakeRedis extends InstalledMock {
  /** Every command this fake has answered so far, in the order it received them. */
  readonly commands: Command[];

  /** How many commands this fake has answered so far, `commands.length` under a shorter name. */
  readonly roundTrips: number;
  countOf(name: string): number;
  place(key: string, value: string, livesForMs?: number): void;
  raw(key: string): string | null;
  ttlOf(key: string): number | null;
  clear(): void;
  failNext(name: string, error: Error): void;
  slow(name: string, byMs: number): void;
}

interface Held {
  value: string;
  expiresAt: number | null;
}

const _MILLISECOND = 1;

export function installFakeRedis(): FakeRedis {
  const held = new Map<string, Held>();
  const commands: Command[] = [];
  const failures = new Map<string, Error>();
  const delays = new Map<string, number>();

  const clock = (): number => DateTime.now().millisecondsSinceEpoch;

  const alive = (key: string): Held | null => {
    const one = held.get(key);
    if (one === undefined) return null;
    if (one.expiresAt !== null && clock() >= one.expiresAt) {
      held.delete(key);
      return null;
    }
    return one;
  };

  const record = async (name: string, args: unknown[]): Promise<void> => {
    commands.push({ name, args });
    const wait = delays.get(name);
    if (wait !== undefined) await new Promise((done) => setTimeout(done, wait));
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

  const setCommand = async (key: string, value: string, ...rest: unknown[]): Promise<"OK" | null> => {
    await record("set", [key, value, ...rest]);

    const exclusive = rest.some((one) => String(one).toUpperCase() === "NX");
    if (exclusive && alive(key) !== null) return null;

    const px = readOption(rest, "PX");
    const ex = readOption(rest, "EX");
    const livesFor = px !== undefined ? Number(px) * _MILLISECOND : ex !== undefined ? Number(ex) * 1_000 : null;

    held.set(key, { value, expiresAt: livesFor === null ? null : clock() + livesFor });
    return "OK";
  };

  const removeMany = async (name: string, keys: string[]): Promise<number> => {
    await record(name, keys);
    let removed = 0;
    for (const key of keys) {
      if (alive(key) !== null) removed++;
      held.delete(key);
    }
    return removed;
  };

  const pipelineCommand = () => {
    const queued: (() => Promise<unknown>)[] = [];
    const chain = {
      setex(key: string, seconds: number, value: string) {
        queued.push(() => setexCommand(key, seconds, value));
        return chain;
      },
      set(key: string, value: string, ...rest: unknown[]) {
        queued.push(() => setCommand(key, value, ...rest));
        return chain;
      },
      async exec() {
        commands.push({ name: "pipeline.exec", args: [queued.length] });
        const answers: [null, unknown][] = [];
        for (const one of queued) answers.push([null, await one()]);
        return answers;
      },
    };
    return chain;
  };

  const setexCommand = async (key: string, seconds: number, value: string): Promise<"OK"> => {
    await record("setex", [key, seconds, value]);
    if (!Number.isInteger(seconds)) {
      throw new Error("ERR value is not an integer or out of range");
    }
    held.set(key, { value, expiresAt: clock() + seconds * 1_000 });
    return "OK";
  };

  const mocks: InstalledMock[] = [
    installMock(
      kv(),
      "get",
      (async (key: string) => {
        await record("get", [key]);
        return alive(key)?.value ?? null;
      }) as unknown as Kv["get"],
    ),
    installMock(
      kv(),
      "mget",
      (async (...keys: string[]) => {
        await record("mget", keys);
        return keys.map((key) => alive(key)?.value ?? null);
      }) as unknown as Kv["mget"],
    ),
    installMock(kv(), "setex", setexCommand as unknown as Kv["setex"]),
    installMock(kv(), "set", setCommand as unknown as Kv["set"]),
    installMock(
      kv(),
      "del",
      ((...keys: string[]) => removeMany("del", keys)) as unknown as Kv["del"],
    ),
    installMock(
      kv(),
      "unlink",
      ((...keys: string[]) => removeMany("unlink", keys)) as unknown as Kv["unlink"],
    ),
    installMock(
      kv(),
      "exists",
      (async (...keys: string[]) => {
        await record("exists", keys);
        return keys.filter((key) => alive(key) !== null).length;
      }) as unknown as Kv["exists"],
    ),
    installMock(
      kv(),
      "pttl",
      (async (key: string) => {
        await record("pttl", [key]);
        const one = alive(key);
        if (one === null) return -2;
        return one.expiresAt === null ? -1 : one.expiresAt - clock();
      }) as unknown as Kv["pttl"],
    ),
    installMock(
      kv(),
      "scan",
      (async (cursor: string, ...rest: unknown[]) => {
        await record("scan", [cursor, ...rest]);
        const pattern = String(readOption([cursor, ...rest], "MATCH") ?? "*");
        const shape = new RegExp(`^${pattern.split("*").map(escape).join(".*")}$`);
        const found = [...held.keys()].filter((key) => alive(key) !== null && shape.test(key));
        return ["0", found] as [string, string[]];
      }) as unknown as Kv["scan"],
    ),
    installMock(kv(), "pipeline", pipelineCommand as unknown as Kv["pipeline"]),
    installMock(
      kv() as unknown as LockCommands,
      "releaseLock",
      async (key: string, token: string) => {
        await record("releaseLock", [key, token]);
        if (alive(key)?.value !== token) return 0;
        held.delete(key);
        return 1;
      },
    ),
  ];

  return {
    commands,
    get roundTrips(): number {
      return commands.length;
    },
    countOf(name: string): number {
      return commands.filter((one) => one.name === name).length;
    },
    place(key: string, value: string, livesForMs?: number): void {
      held.set(key, { value, expiresAt: livesForMs === undefined ? null : clock() + livesForMs });
    },
    raw(key: string): string | null {
      return alive(key)?.value ?? null;
    },
    ttlOf(key: string): number | null {
      const one = alive(key);
      if (one === null || one.expiresAt === null) return null;
      return one.expiresAt - clock();
    },
    clear(): void {
      commands.length = 0;
    },
    failNext(name: string, error: Error): void {
      failures.set(name, error);
    },
    slow(name: string, byMs: number): void {
      delays.set(name, byMs);
    },
    restore(): void {
      for (const one of mocks) one.restore();
    },
  };
}

function escape(part: string): string {
  return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
