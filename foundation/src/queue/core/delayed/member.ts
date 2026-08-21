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

/** The single sorted set every delayed job of every queue waits in. */
export const DELAYED_KEY = "queue:delayed";

/**
 * A job waiting for its due date.
 *
 * Only an explicitly delayed push waits here. A retry does not: the server holds the message
 * and redelivers it, so nothing about a failing job is written to Redis.
 */
export interface DelayedMember {
  /** The identifier the push answered, which follows the job onto the subject. */
  readonly id: string;

  /** The queue this job belongs to, which is what the per-queue counts are grouped by. */
  readonly queue: string;

  /** The subject the promoter publishes to once the due date has passed. */
  readonly subject: string;

  /**
   * The payload the producer sent.
   *
   * Untyped here because one sorted set holds the delayed jobs of every queue. The handler
   * gets its own type back when the promoted message is dispatched.
   */
  readonly data: unknown;
}

/** Serializes a member for the sorted set. */
export function encodeMember(member: DelayedMember): string {
  return JSON.stringify(member);
}

/**
 * Reads a member back, or `null` when nothing usable can be made of it.
 *
 * Returning `null` rather than throwing is what keeps one corrupt member from stopping every
 * delayed job: the promoter drops what it cannot read instead of tripping over it on each
 * pass. See `promoter.ts`.
 */
export function decodeMember(raw: string): DelayedMember | null {
  let parsed: Partial<DelayedMember>;

  try {
    parsed = JSON.parse(raw) as Partial<DelayedMember>;
  } catch {
    return null;
  }

  const readable = typeof parsed.id === "string" &&
    typeof parsed.queue === "string" &&
    typeof parsed.subject === "string";

  return readable ? (parsed as DelayedMember) : null;
}
