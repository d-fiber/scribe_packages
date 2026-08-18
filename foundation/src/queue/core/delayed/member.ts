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
