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

import { Time } from "@scribe/core/contracts/common/time.ts";
import { Valkery } from "@scribe/foundation/src/valkery/valkery.ts";
import type { RemoteConfigRow } from "../db/tables.ts";

/**
 * How long a row is kept, held or not.
 *
 * It is long because nothing has to wait for it: writing, retiming and removing all drop the
 * entry, and the store is shared, so every replica stops serving the old value at the same
 * instant.
 */
const CACHE_TTL = Time.minutes(10);

/**
 * What one cached config holds.
 *
 * The row is wrapped rather than cached on its own so that the absence of a value is cached too.
 * Most configs never get one written, and an unwrapped null would send every read of every one of
 * them to Postgres.
 */
interface CachedValue {
  /** The row in the table, null when the table holds none for this config. */
  readonly row: RemoteConfigRow | null;
}

const cache = new Valkery<CachedValue>({ key: "config:name", ttl: CACHE_TTL });

/**
 * The row held for `name`, loading it through `load` when the cache does not hold it.
 *
 * What comes back is the row as the table holds it, expiry included and not applied: the moment a
 * value is dropped is judged by the caller, after this, so it is exact instead of being rounded up
 * to whatever is left of the cache entry.
 */
export async function cachedValue(
  name: string,
  load: () => Promise<RemoteConfigRow | null>,
): Promise<RemoteConfigRow | null> {
  const held = await cache.upsert(name, async () => ({ row: await load() }));
  return held.row;
}

/** Drops what the cache holds for `name`, so the next read goes to the table. */
export function forgetValue(name: string): Promise<void> {
  return cache.delete(name);
}
