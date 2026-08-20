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

/** One row of the table this package keeps of who belongs where. */
export interface AudienceRow {
  /** The key of the audience, which is the declaration name and its scope joined together. */
  audience: string;

  /**
   * The identifier the caller put in, held as it was given.
   *
   * The package never learns what it stands for, which is what lets an account, a device and a
   * workspace share one table without it having to tell them apart.
   */
  member: string;

  /** When the member was put in, in milliseconds, set by a trigger. */
  created_at: number;

  /** When the membership is dropped, in milliseconds, null for one that never expires. */
  expires_at: number | null;
}

/**
 * The one table this package ships, as the query builder needs to see it.
 *
 * It is declared here rather than taken from a generated schema because the package owns the SQL
 * that creates it. A package that read its own table out of a project's generated file would stop
 * compiling the day that project renamed something it does not own.
 */
export type AudiencesSchema = {
  /** One row per member of one audience, and none for an audience nobody was put in. */
  __audiences__: { row: AudienceRow };
};

/** A handle on this package's own table. */
export class AudiencesTable<K extends keyof AudiencesSchema & string> extends Table<AudiencesSchema, K> {}

/** Who belongs to what. */
export function audiences(): AudiencesTable<"__audiences__"> {
  return new AudiencesTable("__audiences__");
}
