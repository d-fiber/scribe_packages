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
import type { StorageBucket, StorageTransport } from "./transport.ts";

const UNAVAILABLE: StorageBucket = {
  upload: () => Promise.resolve(false),
  remove: () => Promise.resolve(false),
};

let transport: StorageTransport | null = null;

/** Where the process keeps the one transport every upload and every removal goes through. */
export const StorageTransports: {
  use(next: StorageTransport | null): StorageTransport | null;
} = {
  /**
   * Makes `next` the destination of every write from here on, and answers the one it replaced.
   *
   * The previous transport is answered so that whoever swapped it can put it back, which is
   * what the test harness does. A process that installs its transport once at boot ignores it.
   */
  use(next: StorageTransport | null): StorageTransport | null {
    const previous = transport;
    transport = next;
    return previous;
  },
};

/**
 * The bucket that holds the objects of `visibility`.
 *
 * @remarks
 * A process with no transport registered reports it and answers a bucket that refuses
 * everything, rather than throwing. A refusal is what the caller already has to handle, and it
 * is answered before any byte is read.
 */
export function bucketOf(visibility: StorageVisibility): StorageBucket {
  if (!transport) {
    console.error("[storage] no transport registered, refusing the operation.");
    return UNAVAILABLE;
  }

  return transport.of(visibility);
}
