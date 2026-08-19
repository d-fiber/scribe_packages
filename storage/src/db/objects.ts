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
 * The row is read before being written because a path is unique in the index and PostgREST is
 * reached without an upsert here: a second upload to the same path updates the row it already
 * has. The read is the same indexed lookup the write needs anyway, so it also answers whether
 * the object changed bucket.
 */
export async function recordObject(object: RecordedObject): Promise<RecordedWrite> {
  const stored = await storedObject(object.path);
  const row = {
    visibility: object.visibility,
    mime_type: object.mimeType,
    byte_size: object.byteSize,
    blur_hash: object.blurHash,
    updated_at: new Date().toISOString(),
  };

  const displaced = stored !== null && stored.visibility !== object.visibility
    ? stored.visibility as StorageVisibility
    : null;

  if (stored === null) {
    return { stored: await storageObjects().insert({ path: object.path, ...row }), displaced };
  }

  const written = await storageObjects()
    .where((f) => f.path.eq(object.path))
    .update(row);

  return { stored: written, displaced };
}

/** What the index holds about `path`, or null when it holds nothing. */
export function storedObject(path: string): Promise<StorageObjectRow | null> {
  return storageObjects()
    .where((f) => f.path.eq(path))
    .getOne();
}

/** Takes `paths` out of the index, and answers whether the rows went. */
export async function forgetObjects(paths: readonly string[]): Promise<boolean> {
  if (paths.length === 0) return true;

  return await storageObjects()
    .where((f) => f.path.in([...paths]))
    .delete();
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
 * @param after - The path to resume after, exclusive. Empty starts at the beginning.
 */
export async function objectsUnder(
  prefix: string,
  limit: number,
  after = "",
): Promise<ObjectPage | null> {
  const under = `${prefix}/`;

  try {
    const rows = await storageObjects()
      .where((f) => after === "" ? f.path.like(`${under}%`) : [f.path.like(`${under}%`), f.path.gt(after)])
      .order("path")
      .limit(limit)
      .get();

    return {
      objects: rows.filter((row) => row.path.startsWith(under)),
      last: rows.length === 0 ? null : rows[rows.length - 1].path,
      full: rows.length >= limit,
    };
  } catch (e) {
    console.error(`[storage:index] ${prefix} could not be read:`, e);
    return null;
  }
}
