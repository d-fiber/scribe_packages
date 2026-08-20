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
