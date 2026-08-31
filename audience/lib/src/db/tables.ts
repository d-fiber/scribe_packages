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

import { Table } from "@scribe/foundation/database";

/** One row of the table this package keeps of who belongs where. */
export interface AudienceRow {
  /**
   * The feature this row's audience was declared under, and the value the table is partitioned
   * on.
   *
   * It is what keeps a high-churn feature from degrading the queries, the autovacuum load and the
   * cache hit rate of an unrelated one sharing this table: each feature's rows live in their own
   * partition, or in the shared `default` one when nobody promoted a partition of their own.
   */
  feature: string;

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

/** One row of the table that durably remembers which feature claimed which declaration name. */
export interface AudienceDeclarationRow {
  /** The feature this declaration was claimed under. */
  feature: string;

  /** The declaration name, unique within `feature`. */
  name: string;

  /**
   * What claimed this pair, so a second, different owner claiming it can be told apart from the
   * same owner claiming it again at the next boot.
   */
  owner: string;

  /** When this pair was first claimed, in milliseconds, set by a trigger. */
  created_at: number;
}

/**
 * The two tables this package ships, as the query builder needs to see them.
 *
 * They are declared here rather than taken from a generated schema because the package owns the
 * SQL that creates them. A package that read its own tables out of a project's generated file
 * would stop compiling the day that project renamed something it does not own.
 */
export type AudiencesSchema = {
  /** One row per member of one audience, and none for an audience nobody was put in. */
  __audiences__: { row: AudienceRow };

  /** One row per (feature, name) pair a declaration has claimed, across every process. */
  __audience_declarations__: { row: AudienceDeclarationRow };
};

/** A handle on one of this package's own tables. */
export class AudiencesTable<K extends keyof AudiencesSchema & string> extends Table<AudiencesSchema, K> {}

/** Who belongs to what. */
export function audiences(): AudiencesTable<"__audiences__"> {
  return new AudiencesTable("__audiences__");
}

/** Which feature claimed which declaration name. */
export function audienceDeclarations(): AudiencesTable<"__audience_declarations__"> {
  return new AudiencesTable("__audience_declarations__");
}
