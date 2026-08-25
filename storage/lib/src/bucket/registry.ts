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
