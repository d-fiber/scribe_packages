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

import type { UnmodifiableList } from "@scribe/alchemy";
import type { FieldTransition, RegisteredTrigger } from "./trigger_registry.ts";
import type { TriggerEvent } from "./trigger_event.ts";

/** One delivery to make: the declaration to publish on, and the column it is about. */
export interface TriggerMatch {
  /** The declaration whose queue receives the event. */
  readonly trigger: RegisteredTrigger;

  /** The column that moved, or null when the declaration watches the row. */
  readonly field: string | null;
}

/**
 * The deliveries one outbox row makes, which is none, one, or one per column that moved.
 *
 * A single write can concern several declarations: `onUpdate` on the table and `onFieldChange`
 * on one of its columns both answer to the same row. A declaration watching several columns is
 * delivered once per column, so a body reads `change.field` rather than looking for what moved.
 */
export function matchesOf(
  triggers: UnmodifiableList<RegisteredTrigger>,
  event: TriggerEvent,
): UnmodifiableList<TriggerMatch> {
  const matches: TriggerMatch[] = [];

  for (const trigger of triggers) {
    if (trigger.table !== event.table || trigger.op !== event.op) continue;

    if (trigger.fields.length === 0) {
      matches.push({ trigger, field: null });
      continue;
    }

    for (const field of trigger.fields) {
      if (movedInto(event, field, trigger.when)) matches.push({ trigger, field });
    }
  }

  return matches;
}

/** Whether `field` holds a different value than it did, and made the transition `when` asks for. */
function movedInto(event: TriggerEvent, field: string, when: FieldTransition | null): boolean {
  const before = event.before?.[field] ?? null;
  const after = event.after?.[field] ?? null;

  if (sameValue(before, after)) return false;
  if (when === null) return true;

  if (when.from !== undefined && !sameValue(before, when.from)) return false;
  if (when.to !== undefined && !sameValue(after, when.to)) return false;

  return true;
}

/**
 * Whether two column values are the one same value.
 *
 * A column is compared as it comes out of JSON, so a scalar compares by identity and anything
 * structured is walked. Walking rather than serialising is what makes the comparison mean what
 * it says: two encodings of one object differ as text whenever their keys come out in another
 * order, which a database is free to do between two reads, and the column would read as changed
 * when it holds exactly what it held.
 *
 * It is also what a caller pays for: walking stops at the first difference, where serialising
 * builds both strings whole before comparing a single character of them.
 *
 * The walk keeps what is left to compare on a list of its own rather than on the call stack, so
 * a column nested deeper than the stack is deep is compared instead of raising.
 */
function sameValue(left: unknown, right: unknown): boolean {
  const pending: [unknown, unknown][] = [[left, right]];

  while (pending.length > 0) {
    const [mine, theirs] = pending.pop() as [unknown, unknown];

    if (mine === theirs) continue;
    if (mine === null || theirs === null) return false;
    if (typeof mine !== "object" || typeof theirs !== "object") return false;

    if (Array.isArray(mine) || Array.isArray(theirs)) {
      if (!Array.isArray(mine) || !Array.isArray(theirs) || mine.length !== theirs.length) return false;
      for (let at = 0; at < mine.length; at++) pending.push([mine[at], theirs[at]]);
      continue;
    }

    const ours = mine as Record<string, unknown>;
    const yours = theirs as Record<string, unknown>;
    const keys = Object.keys(ours);
    if (keys.length !== Object.keys(yours).length) return false;

    for (const key of keys) {
      if (!(key in yours)) return false;
      pending.push([ours[key], yours[key]]);
    }
  }

  return true;
}
