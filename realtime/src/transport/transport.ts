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

/** One emission, addressed and ready to be written wherever the transport writes. */
export interface RealtimeRow {
  /** The full channel this emission is addressed to, which decides who hears it. */
  readonly channel: string;

  /** What happened, as the declaration named it. */
  readonly action: string;

  /** The identifier of the row this is about, taken from the payload's declared key. */
  readonly entityId: string;

  /** What travels, as the declaration's type describes it. */
  readonly payload: Record<string, unknown>;
}

/**
 * Where an emission goes once it has been addressed.
 *
 * @remarks
 * The port exists so that the channel is replaceable. `SyncEventsTransport` writes a row and
 * lets Postgres broadcast it, which is what a mounted package does by default; a project that
 * would rather push into a queue or towards a third party swaps the implementation and leaves
 * every declaration alone.
 */
export interface RealtimeTransport {
  /** Sends `row`, and answers whether it left. */
  send(row: RealtimeRow): Promise<boolean>;
}
