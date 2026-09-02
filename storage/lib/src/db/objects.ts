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

import { wrote } from "@scribe/foundation/database";
import { DateTime } from "@scribe/alchemy";
import type { Future } from "@scribe/alchemy";
import type { StorageVisibility } from "../core/visibility.ts";
import { type StorageObjectRow, storageObjects } from "./tables.ts";

/** What one upload asks the index to remember about the object it just wrote. */
export interface RecordedObject {
  /** The key the bytes were written under. */
  readonly path: string;

  /** The bucket the bytes went to. */
  readonly visibility: StorageVisibility;

  /** The media type the bytes were uploaded with. */
  readonly mimeType: string;

  /** How many bytes were uploaded. */
  readonly byteSize: number;

  /** The blur hash derived from the bytes, null when the resource has none. */
  readonly blurHash: string | null;
}

/** What writing one row into the index did. */
export interface RecordedWrite {
  /** Whether the index now holds the object. */
  readonly stored: boolean;

  /**
   * The bucket the index held this path in, when it is not the one just written.
   *
   * A path designates one object, so a declaration that changes bucket leaves its bytes behind
   * in the old one. Naming the displaced bucket is what lets the caller go and remove them.
   */
  readonly displaced: StorageVisibility | null;
}

/**
 * Writes what `object` says, and answers what that did.
 *
 * @remarks
 * The write itself is a single upsert on `path`, so two uploads racing to the same new key no
 * longer depend on which one PostgREST sees first: both converge on one row instead of one of
 * them tripping the primary key and losing bytes it already wrote. The read that decides
 * {@link RecordedWrite.displaced} stays a plain lookup taken before the write, which keeps it
 * possible, in that same race, to miss a bucket change: a rarer case than the one this fixes,
 * since it only fires when a folder's declared bucket itself changes between two racing uploads,
 * not on ordinary concurrent traffic to one key.
 */
export async function recordObject(object: RecordedObject): Future<RecordedWrite> {
  const stored = await storedObject(object.path);
  const displaced = stored !== null && stored.visibility !== object.visibility
    ? stored.visibility as StorageVisibility
    : null;

  const written = await storageObjects().upsert(
    {
      path: object.path,
      visibility: object.visibility,
      mime_type: object.mimeType,
      byte_size: object.byteSize,
      blur_hash: object.blurHash,
      updated_at: DateTime.now().toIso8601String(),
    },
    { onConflict: "path" },
  );

  return { stored: wrote(written), displaced };
}

/** What the index holds about `path`, or null when it holds nothing. */
export function storedObject(path: string): Future<StorageObjectRow | null> {
  return storageObjects()
    .where((f) => f.path.eq(path))
    .getOne();
}

/** Takes `paths` out of the index, and answers whether the rows went. */
export async function forgetObjects(paths: readonly string[]): Future<boolean> {
  if (paths.length === 0) return true;

  return wrote(
    await storageObjects()
      .where((f) => f.path.in([...paths]))
      .delete(),
  );
}

/** One page of the index, read under a prefix. */
export interface ObjectPage {
  /** The rows that really sit under the prefix, in path order. */
  readonly objects: readonly StorageObjectRow[];

  /** The last path the database answered with, kept or not, or null when it answered none. */
  readonly last: string | null;

  /** Whether the database filled the page, which is what says more rows may follow. */
  readonly full: boolean;
}

/**
 * One page of what is stored under `prefix`, in path order, or null when the index could not be
 * read.
 *
 * @remarks
 * The database narrows with a `like`, whose `_` matches any single character, and a path segment
 * is allowed to carry one. `user_1/photo` and `userX1/photo` therefore come back from the same
 * query, and the exact test that follows is what keeps one folder from listing, or clearing, the
 * objects of its neighbour.
 *
 * That test is also why a page reports the last path the database answered rather than the last
 * one it kept: a page made entirely of a neighbour's objects keeps nothing, and a caller walking
 * the pages would ask for the same one forever if it resumed from what it had.
 *
 * The query asks for one row more than `limit`. A folder holding exactly `limit` objects then
 * comes back under that cap, so `full` reads false instead of mistaking the last row for proof
 * that more exist; a folder holding more comes back over it, and the extra row is dropped rather
 * than handed to the caller.
 *
 * @param after - The path to resume after, exclusive. Empty starts at the beginning.
 */
export async function objectsUnder(
  prefix: string,
  limit: number,
  after = "",
): Future<ObjectPage | null> {
  const under = `${prefix}/`;

  try {
    const rows = await storageObjects()
      .where((f) => after === "" ? f.path.like(`${under}%`) : [f.path.like(`${under}%`), f.path.gt(after)])
      .order("path")
      .limit(limit + 1)
      .get();

    const full = rows.length > limit;
    const matched = rows.filter((row) => row.path.startsWith(under));
    const objects = full ? matched.slice(0, limit) : matched;

    return {
      objects,
      last: objects.length === 0 ? null : objects[objects.length - 1].path,
      full,
    };
  } catch (e) {
    console.error(`[storage:index] ${prefix} could not be read:`, e);
    return null;
  }
}
