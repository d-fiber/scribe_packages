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


import { storageSettings } from "@scribe/storage/src/settings.ts";

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
