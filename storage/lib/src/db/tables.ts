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

import { Table } from "@scribe/foundation/lib/src/database/table.ts";

/** One row of the index this package keeps of the objects it has stored. */
export interface StorageObjectRow {
  /** The key the bytes are stored under, which names one object whichever bucket holds it. */
  path: string;

  /** One of the values of `StorageVisibility`, which says which bucket the bytes are in. */
  visibility: string;

  /** The media type the bytes were uploaded with, as the declared extension resolved it. */
  mime_type: string;

  /** How many bytes were uploaded. */
  byte_size: number;

  /** The blur hash computed at upload, null for a file nobody can derive a picture from. */
  blur_hash: string | null;

  /** When the row was last written, which is when the object was last uploaded. */
  updated_at: string;
}

/**
 * The table this package ships, as the query builder needs to see it.
 *
 * It is declared here rather than taken from a generated schema because the package owns the
 * SQL that creates it. A package that read its own table out of a project's generated file
 * would stop compiling the day that project renamed something it does not own.
 */
export type StorageSchema = {
  /** What the package stored, one row per object. */
  __storage_objects__: { row: StorageObjectRow };
};

/** A handle on this package's own table. */
export class StorageTable<K extends keyof StorageSchema & string> extends Table<StorageSchema, K> {}

/** The index of every object this package stored. */
export function storageObjects(): StorageTable<"__storage_objects__"> {
  return new StorageTable("__storage_objects__");
}
