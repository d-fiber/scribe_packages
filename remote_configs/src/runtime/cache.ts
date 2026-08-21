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

import { Time } from "@scribe/core/contracts/common/time.ts";
import { Valkery } from "@scribe/foundation/lib/src/valkery/valkery.ts";
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
