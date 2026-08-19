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


import type { StorageVisibility } from "./visibility.ts";

const declarations = new Map<string, StorageVisibility>();

/**
 * Records that `path` was declared, and which bucket it writes to.
 *
 * @remarks
 * Two declarations of the same path that disagree on the bucket would write the same key to
 * two different places, and whichever loaded second would decide where the reader of the first
 * one looks. It throws rather than letting the process start on that.
 */
export function declareStorage(path: string, visibility: StorageVisibility): void {
  const already = declarations.get(path);
  if (already !== undefined && already !== visibility) {
    throw new TypeError(
      `storage path "${path}" is declared twice, once as "${already}" and once as "${visibility}".`,
    );
  }

  declarations.set(path, visibility);
}

/** Every path this process declared, with the bucket each one writes to. */
export function declaredStorage(): ReadonlyMap<string, StorageVisibility> {
  return declarations;
}
