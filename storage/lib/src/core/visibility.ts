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


import { storageSettings } from "@scribe/storage/lib/src/settings.ts";

/**
 * Which bucket an object lives in, and therefore how its URL is served.
 *
 * @remarks
 * It is not an application check. Nothing in this package asks who is calling: a route decides
 * whether its caller may reach a resource, and calls the resource once it has. What this enum
 * decides is where the bytes are written, which settles whether a URL alone is enough to read
 * them back.
 */
export enum StorageVisibility {
  /** The bytes are readable by anyone holding the URL, since the bucket is served openly. */
  Public = "public",

  /** The bytes are behind the admin gateway, so a URL on its own reads nothing. */
  Private = "private",
}

const PUBLIC_BUCKET = "public_bucket";
const PRIVATE_BUCKET = "private_bucket";

/** The bucket that holds the objects of `visibility`. */
export function bucketNameOf(visibility: StorageVisibility): string {
  return visibility === StorageVisibility.Private ? PRIVATE_BUCKET : PUBLIC_BUCKET;
}

/** The URL `path` is served from, which depends on the bucket it was written to. */
export function objectUrl(path: string, visibility: StorageVisibility): string {
  const { privateBaseUrl, publicBaseUrl } = storageSettings.get();

  return visibility === StorageVisibility.Private
    ? `${privateBaseUrl}/storage/v1/object/${PRIVATE_BUCKET}/${path}`
    : `${publicBaseUrl}/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`;
}
