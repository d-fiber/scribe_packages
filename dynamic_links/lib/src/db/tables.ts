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

/**
 * What a link row carries in its `payload` column.
 *
 * The two keys are short because the column holds one of these per link, and neither is ever
 * read by a person: the meaning lives in the declaration the first key names.
 */
export interface StoredPayload {
  /** The name of the declaration that wrote this link, which is what resolution looks up. */
  readonly k: string;

  /** The data that link was created with, as its declaration named it. */
  readonly a: Readonly<Record<string, string | number | boolean>>;
}

/** One row of the table this package keeps of the links that were created. */
export interface DynamicLinkRow {
  /** The identifier the table assigned, which the statistics reference. */
  link_id: number;

  /** The slug the link answers to, unique across the table. */
  slug: string;

  /** The declaration and the parameters, as `StoredPayload` writes them. */
  payload: StoredPayload;

  /** The account that created the link, null for a link no account owns. */
  user_id: string | null;

  /** When the row was written, in milliseconds, set by a trigger. */
  created_at: number;

  /** When the row was last written, in milliseconds, set by a trigger. */
  updated_at: number;

  /** When the link stops resolving, in milliseconds, null for a link that never expires. */
  expires_at: number | null;
}

/** One row of the table this package writes a visit into. */
export interface DynamicLinkStatisticRow {
  /** The identifier the table assigned to this visit. */
  statistic_id: number;

  /** The link that was visited. */
  link_id: number;

  /** When the visit was recorded, in milliseconds, set by a trigger. */
  created_at: number;

  /** The account the visit was made from, null for a visitor who was not signed in. */
  user_id: string | null;

  /** The device the client announced, null when it announced none. */
  device_id: string | null;

  /** The address the visit came from, null when the node recorded none. */
  ip_address: string | null;

  /** The user agent the visit carried, null when it carried none. */
  user_agent: string | null;

  /** The page the visit came from, null when the client sent none. */
  referer: string | null;

  /** One of the values of `LinkOutcome`, held as text and checked by the table. */
  outcome: string;

  /** One of the values of `LinkPlatform`, null when the client announced none. */
  platform: string | null;
}

/**
 * The two tables this package ships, as the query builder needs to see them.
 *
 * They are declared here rather than taken from a generated schema because the package owns the
 * SQL that creates them. A package that read its own tables out of a project's generated file
 * would stop compiling the day that project renamed something it does not own.
 */
export type DynamicLinksSchema = {
  /** One row per link that was created. */
  __dynamic_links__: { row: DynamicLinkRow };

  /** One row per visit that was recorded. */
  __dynamic_link_statistics__: { row: DynamicLinkStatisticRow };
};

/** A handle on one of this package's own tables. */
export class DynamicLinksTable<K extends keyof DynamicLinksSchema & string> extends Table<DynamicLinksSchema, K> {}

/** The links this package created. */
export function dynamicLinks(): DynamicLinksTable<"__dynamic_links__"> {
  return new DynamicLinksTable("__dynamic_links__");
}

/** The visits this package recorded. */
export function dynamicLinkStatistics(): DynamicLinksTable<"__dynamic_link_statistics__"> {
  return new DynamicLinksTable("__dynamic_link_statistics__");
}
