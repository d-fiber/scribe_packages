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

import type { FieldTransition, RegisteredTrigger } from "./registry.ts";
import type { TriggerEvent } from "./wire.ts";

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
  triggers: readonly RegisteredTrigger[],
  event: TriggerEvent,
): readonly TriggerMatch[] {
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
 * structured compares by its serialisation. Serialising is the only comparison available here:
 * the engine holds no schema, so it cannot know that a column is a date or an array of them.
 */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  if (typeof left !== "object" || typeof right !== "object") return false;

  return JSON.stringify(left) === JSON.stringify(right);
}
