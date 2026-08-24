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

import { type RemoteConfigRow, remoteConfigs } from "./tables.ts";

/** What storing one value puts in the table. */
export interface StoredValue {
  /** The declaration the value belongs to. */
  readonly name: string;

  /** The value to store. */
  readonly value: unknown;

  /** When it is dropped, in milliseconds, null for a value that never expires. */
  readonly expiresAt: number | null;
}

/** The row held for `name`, or null when the table holds none. */
export function valueOf(name: string): Promise<RemoteConfigRow | null> {
  return remoteConfigs()
    .where((f) => f.name.eq(name))
    .getOne();
}

/**
 * Stores `stored`, replacing what the table held for that name, and answers whether it took.
 *
 * @remarks
 * It reads before it writes because the query builder has no upsert and an update that matched
 * nothing is indistinguishable from one that matched a row. Two writers storing the same name in
 * the same instant therefore have one of them refused by the primary key, which answers false
 * rather than losing the other's value.
 */
export async function writeValue(stored: StoredValue): Promise<boolean> {
  const held = await valueOf(stored.name);

  if (held === null) {
    return await remoteConfigs().insert({
      name: stored.name,
      value: stored.value,
      expires_at: stored.expiresAt,
    });
  }

  return await remoteConfigs()
    .where((f) => f.name.eq(stored.name))
    .update({ value: stored.value, expires_at: stored.expiresAt });
}

/**
 * Moves when `name` is dropped, and answers whether a row was there to move.
 *
 * The value is left alone, which is the whole point: a caller that wanted to write it again would
 * have called the other one.
 */
export async function retimeValue(name: string, expiresAt: number | null): Promise<boolean> {
  const held = await valueOf(name);
  if (held === null) return false;

  return await remoteConfigs()
    .where((f) => f.name.eq(name))
    .update({ expires_at: expiresAt });
}

/** Removes what is stored under `name`, and answers whether a row was removed. */
export async function dropValue(name: string): Promise<boolean> {
  const removed = await remoteConfigs()
    .where((f) => f.name.eq(name))
    .deleteOne((s) => ({ name: s.name }));

  return removed !== null;
}
