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

// deno-lint-ignore-file no-explicit-any
import "@scribe/core/testing/settings.ts";

import { Tables } from "@scribe/foundation/lib/src/database/gen/tables.ts";
import { TablesBase } from "@scribe/foundation/lib/src/database/tables.ts";
import { database } from "@scribe/foundation/lib/src/database/database.ts";
import type { InstalledMock } from "@scribe/core/testing/install.ts";
import type { FakePostgrestSeed } from "@scribe/foundation/tests/testing/database.ts";
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
