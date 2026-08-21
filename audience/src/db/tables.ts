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
