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

/**
 * One bucket, as this package needs to reach it.
 *
 * It writes and it removes, and it never reads back what it holds: the index this package keeps
 * answers that, which is what lets a listing carry a size and a media type rather than a bare
 * list of keys, and what removes the depth and page caps a recursive walk needed.
 */
export interface StorageBucket {
  /** Writes `body` at `path`, replacing whatever was there, and answers whether it landed. */
  upload(path: string, body: ArrayBuffer, contentType: string): Promise<boolean>;

  /** Removes `paths` in one call, and answers whether the bucket took them all. */
  remove(paths: readonly string[]): Promise<boolean>;
}

/** Where a process gets the bucket that holds the objects of a given visibility. */
export interface StorageTransport {
  /** The bucket `visibility` names. */
  of(visibility: StorageVisibility): StorageBucket;
}
