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
