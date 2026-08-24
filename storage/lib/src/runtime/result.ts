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


import type { Result } from "@scribe/alchemy";
import type { StorageVisibility } from "../core/visibility.ts";

/** Why an upload did not happen. */
export enum StorageUploadError {
  /** The file carries an extension the resource does not declare. */
  InvalidType = "invalid_type",

  /** An argument holds something a key cannot, so no path could be rendered from it. */
  InvalidPath = "invalid_path",

  /** The file is larger than the resource accepts. */
  FileTooLarge = "file_too_large",

  /** The bucket refused the bytes, or could not be reached. */
  UploadFailed = "upload_failed",

  /**
   * The bytes are written, and the row that names them is not.
   *
   * The bytes are deliberately left where they are: they may well have replaced an object that
   * a previous upload wrote, and destroying that costs more than the missing row. The next
   * upload that succeeds puts the two back in step.
   */
  IndexFailed = "index_failed",
}

/** Why a removal did not happen. */
export enum StorageRemoveError {
  /** An argument holds something a key cannot, so no path could be rendered from it. */
  InvalidPath = "invalid_path",

  /** The bucket refused the removal, or could not be reached. */
  RemoveFailed = "remove_failed",

  /** The bytes are gone, and the rows that named them are still there. */
  IndexFailed = "index_failed",
}

/** Why a listing did not happen. */
export enum StorageListError {
  /** An argument holds something a key cannot, so no prefix could be rendered from it. */
  InvalidPath = "invalid_path",

  /** The index could not be read. */
  ListFailed = "list_failed",
}

/** What an upload answers: the resource's own description of the object, or why it did not go. */
export type StorageUploadResult<T> = Result<T, StorageUploadError>;

/** What a removal answers. */
export type StorageRemoveResult = Result<void, StorageRemoveError>;

/** What a listing answers: what a folder holds, or why it could not be read. */
export type StorageListResult = Result<StorageObject[], StorageListError>;

/** One object of a folder, as the index remembers it. */
export type StorageObject = {
  /** The key the bytes are stored under. */
  path: string;

  /** Where the object is served from, which follows the bucket it was written to. */
  url: string;

  /** The bucket holding the bytes, which may differ from what its folder declares today. */
  visibility: StorageVisibility;

  /** The media type the bytes were uploaded with. */
  mimeType: string;

  /** How many bytes were uploaded. */
  byteSize: number;

  /** The blur hash derived at upload, null for a file nothing can be drawn from. */
  blurHash: string | null;

  /** When the object was last uploaded. */
  updatedAt: string;
};

/** What uploading to an image resource answers. */
export type StorageImage = {
  /** The key the bytes were written under. */
  path: string;

  /** Where the picture is served from. */
  url: string;

  /** The blur hash of the picture, null when it could not be decoded. */
  blurHash: string | null;
};

/** What uploading to a video resource answers. */
export type StorageVideo = {
  /** The key the bytes were written under. */
  path: string;

  /** Where the video is served from. */
  url: string;

  /** The blur hash of its first frame, null when that frame could not be decoded. */
  blurHash: string | null;
};

/** What uploading to a file resource answers. */
export type StorageFile = {
  /** The key the bytes were written under. */
  path: string;

  /** Where the file is served from. */
  url: string;
};
