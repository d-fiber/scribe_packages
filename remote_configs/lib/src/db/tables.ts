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

/** One row of the table this package keeps of the values that were stored. */
export interface RemoteConfigRow {
  /** The name of the declaration this value belongs to, which is the whole key. */
  name: string;

  /**
   * The value stored, held as jsonb and handed back as the declaration's own type.
   *
   * It is `unknown` and not an object: a config holding a string or a number is the common case,
   * and jsonb carries a scalar as readily as it carries a shape.
   */
  value: unknown;

  /** When the value was first written, in milliseconds, set by a trigger. */
  created_at: number;

  /** When the value was last written, in milliseconds, set by a trigger. */
  updated_at: number;

  /** When it is dropped, in milliseconds, null for a value that never expires. */
  expires_at: number | null;
}

/**
 * The one table this package ships, as the query builder needs to see it.
 *
 * It is declared here rather than taken from a generated schema because the package owns the SQL
 * that creates it. A package that read its own table out of a project's generated file would stop
 * compiling the day that project renamed something it does not own.
 */
export type RemoteConfigsSchema = {
  /** One row per config that holds a value, and none for a config left as declared. */
  __remote_configs__: { row: RemoteConfigRow };
};

/** A handle on this package's own table. */
export class RemoteConfigsTable<K extends keyof RemoteConfigsSchema & string> extends Table<RemoteConfigsSchema, K> {}

/** The values this package stored. */
export function remoteConfigs(): RemoteConfigsTable<"__remote_configs__"> {
  return new RemoteConfigsTable("__remote_configs__");
}
