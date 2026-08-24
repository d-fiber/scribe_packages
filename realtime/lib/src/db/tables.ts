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

/** One row of the log every emission writes, and the trigger reads to broadcast. */
export interface RealtimeEventRow {
  /** The identifier the sequence assigned when the row was written. */
  id: number;

  /** The full channel the row is addressed to, which decides who hears it. */
  channel: string;

  /** What happened, as the declaration named it: `insert`, `update`, `delete` or its own word. */
  action: string;

  /** The identifier of the row the event is about, pulled from the payload's declared key. */
  entity_id: string;

  /**
   * What travels, as the declaration's type describes it.
   *
   * The column carries the payload to the trigger and stops there: the trigger broadcasts it
   * and empties the column before the row is written, so what the log keeps is the identifier
   * and never the body. The catch-up a client runs on reconnection reads identifiers, so
   * nothing needs the body once it has been broadcast, and a row that kept one would hold it
   * for the whole retention window.
   */
  payload: Record<string, unknown>;

  /** When the event was written, in milliseconds since the epoch. */
  occurred_at: number;
}

/** One row of the table that says how open a channel's own broadcast is. */
export interface RealtimeChannelRow {
  /** The name a declaration was given, which is also its broadcast channel. */
  channel: string;

  /** One of the values of `Listen`, which the trigger reads to pick its broadcast mode. */
  listen: string;
}

/** One row of the table that says which account may listen to which channel. */
export interface RealtimeGrantRow {
  /** The full channel the grant opens, never a prefix of one. */
  channel: string;

  /** The account the grant is written for, compared to the subject of the caller's token. */
  account_id: string;

  /** When the grant was written. */
  granted_at: string;
}

/**
 * The three tables this package ships, as the query builder needs to see them.
 *
 * They are declared here rather than taken from a generated schema because the package owns
 * the SQL that creates them. A package that read its own tables out of a project's generated
 * file would stop compiling the day that project renamed something it does not own.
 */
export type RealtimeSchema = {
  /** The log every emission writes to, and the broadcast trigger fires on. */
  __realtime_events__: { row: RealtimeEventRow };

  /** How open each declared channel's broadcast is. */
  __realtime_channels__: { row: RealtimeChannelRow };

  /** Which account may listen to which channel. */
  __realtime_grants__: { row: RealtimeGrantRow };
};

/** A handle on one of this package's own tables. */
export class RealtimeTable<K extends keyof RealtimeSchema & string> extends Table<RealtimeSchema, K> {}

/** The log every emission writes to. */
export function realtimeEvents(): RealtimeTable<"__realtime_events__"> {
  return new RealtimeTable("__realtime_events__");
}

/** How open each declared channel's broadcast is. */
export function realtimeChannels(): RealtimeTable<"__realtime_channels__"> {
  return new RealtimeTable("__realtime_channels__");
}

/** Which account may listen to which channel. */
export function realtimeGrants(): RealtimeTable<"__realtime_grants__"> {
  return new RealtimeTable("__realtime_grants__");
}
