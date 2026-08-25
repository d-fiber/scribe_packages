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

import { DeclarationError, DuplicateDeclarationError, type UnmodifiableList } from "@scribe/alchemy";
import type { TriggerSourceRow } from "./trigger_tables.ts";
import type { TriggerOp } from "./trigger_change.ts";

/** The transition a column has to make for its declaration to fire. */
export interface FieldTransition {
  /** The value the column has to be leaving, any value when absent. */
  readonly from?: unknown;

  /** The value the column has to be reaching, any value when absent. */
  readonly to?: unknown;
}

/** A declaration as the runner and the report see it, stripped of the types the body reads. */
export interface RegisteredTrigger {
  /** The derived or given name, which the queue `trigger:<name>` is built from. */
  readonly name: string;

  /** The table this declaration observes. */
  readonly table: string;

  /** The column holding the identifier of one row. */
  readonly key: string;

  /** The operation this declaration answers to. */
  readonly op: TriggerOp;

  /** The columns it watches, empty when it watches the row. */
  readonly fields: UnmodifiableList<string>;

  /** The transition a watched column has to make, null when any change will do. */
  readonly when: FieldTransition | null;
}

/**
 * Every declaration of this process, indexed by name.
 *
 * The name has to be unique because it names the queue a change is published on: two
 * declarations sharing one would take each other's deliveries.
 */
export class TriggerRegistry {
  readonly #triggers = new Map<string, RegisteredTrigger>();

  /** Registers a declaration, and refuses a name already taken. */
  add(trigger: RegisteredTrigger): void {
    const existing = this.#triggers.get(trigger.name);

    if (existing !== undefined) {
      throw new DuplicateDeclarationError(
        `Trigger("${trigger.table}"): "${trigger.name}" is already declared. Pass ` +
          `{ path: "...", name: "..." } to tell the two apart.`,
      );
    }

    this.#triggers.set(trigger.name, trigger);
  }

  /** The declarations registered so far, in declaration order. */
  list(): UnmodifiableList<RegisteredTrigger> {
    return [...this.#triggers.values()];
  }

  /**
   * The tables to write into `__trigger_sources__`, one row per table.
   *
   * Two declarations on the same table that disagree on its key column are refused here rather
   * than at the write: the table holds one key per table, so the second row would silently
   * replace the first and one of the two bodies would stop being called.
   */
  sources(): UnmodifiableList<TriggerSourceRow> {
    const keys = new Map<string, string>();

    for (const trigger of this.#triggers.values()) {
      const known = keys.get(trigger.table);

      if (known !== undefined && known !== trigger.key) {
        throw new DeclarationError(
          `Trigger("${trigger.table}"): the table is declared with two key columns, ` +
            `"${known}" and "${trigger.key}". A table has one.`,
        );
      }

      keys.set(trigger.table, trigger.key);
    }

    return [...keys].map(([table_name, key_column]) => ({ table_name, key_column }));
  }

  /** One line naming what is armed, printed at start-up. */
  report(): string {
    const triggers = this.list();
    if (triggers.length === 0) return "[trigger] no trigger declared";

    const tables = new Set(triggers.map((trigger) => trigger.table)).size;
    return `[trigger] ${triggers.length} declared on ${tables} table(s)`;
  }
}

/** The registry every declaration writes into, one per process. */
export const triggerRegistry: TriggerRegistry = new TriggerRegistry();
