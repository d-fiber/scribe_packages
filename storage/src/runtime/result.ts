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

import type { Result } from "@scribe/core/contracts/result.ts";
import type { StorageVisibility } from "../access/visibility.ts";

export enum StorageUploadError {
  Unauthorized = "unauthorized",
  InvalidType = "invalid_type",
  InvalidPath = "invalid_path",
  FileTooLarge = "file_too_large",
  UploadFailed = "upload_failed",
}

export enum StorageRemoveError {
  Unauthorized = "unauthorized",
  InvalidPath = "invalid_path",
  RemoveFailed = "remove_failed",
}

export enum StorageListError {
  Unauthorized = "unauthorized",
  InvalidPath = "invalid_path",
  ListFailed = "list_failed",
}

export type StorageUploadResult<T> = Result<T, StorageUploadError>;
export type StorageRemoveResult = Result<void, StorageRemoveError>;
export type StorageListResult = Result<StorageObject[], StorageListError>;

export type StorageObject = {
  path: string;
  url: string;
  visibility: StorageVisibility;
  updatedAt: string | null;
};

export type StorageImage = {
  path: string;
  url: string;
  blurHash: string | null;
};

export type StorageVideo = {
  path: string;
  url: string;
  blurHash: string | null;
};

export type StorageFile = {
  path: string;
  url: string;
};
