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


import { Table } from "@scribe/foundation/src/database/table.ts";

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
