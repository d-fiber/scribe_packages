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
import "@scribe/core/testing/settings.ts";

import { Tables } from "@scribe/foundation/src/database/gen/tables.ts";
import { TablesBase } from "@scribe/foundation/src/database/tables.ts";
import { database } from "@scribe/foundation/src/database/database.ts";
import type { InstalledMock } from "@scribe/core/testing/install.ts";
import type { FakePostgrestSeed } from "@scribe/foundation/testing/database.ts";
import { createDatabaseMock, type DatabaseMock } from "./database.ts";

/**
 * Puts one own property per table method on `target`, each delegating to `source`, and answers
 * the handles that take them back off.
 *
 * @remarks
 * `database` is a `Tables` instance rather than an object of getters, so its table methods live
 * on the prototype where `stub()` has no grip on them. An own property shadows the prototype
 * one, and deleting it lets the prototype reappear.
 *
 * Both prototypes are walked, because `rpc` lives on `TablesBase.prototype` and not on the
 * generated `Tables.prototype`. Walking only the generated class would leave `database.rpc()`
 * on the real PostgREST client, and an endpoint under test would reach the network instead of
 * the fake. `TablesBase` is imported from its own module because `gen/tables.ts` is written by
 * `koko gen code` and does not re-export it.
 */
function _shadowTableMethods(target: object, source: Tables): InstalledMock[] {
  const names = [
    ...new Set([
      ...Object.getOwnPropertyNames(Tables.prototype),
      ...Object.getOwnPropertyNames(TablesBase.prototype),
    ]),
  ].filter(
    (name) => name !== "constructor" && typeof (source as any)[name] === "function",
  );

  return names.map((name) => {
    Object.defineProperty(target, name, {
      value: (...args: unknown[]) => (source as any)[name](...args),
      configurable: true,
      writable: true,
    });
    return {
      restore(): void {
        delete (target as any)[name];
      },
    };
  });
}

/**
 * Points every table method of `database` at an in-memory PostgREST holding `seed`, and answers
 * that fake with the `restore()` that puts the real client back.
 *
 * @param seed - The rows each table starts with, keyed by table name. An absent table starts
 * empty.
 */
export function installDatabaseMock(
  seed: FakePostgrestSeed = {},
): DatabaseMock & InstalledMock {
  const mock = createDatabaseMock(seed);
  const installed: InstalledMock[] = [
    ..._shadowTableMethods(database, mock.service),
  ];

  return Object.assign(mock, {
    restore(): void {
      for (const entry of installed) entry.restore();
    },
  });
}
