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

import { DateTime, DeclarationError, type UnmodifiableList } from "@scribe/alchemy";
import type { QueueOptions } from "@scribe/foundation/lib/src/queue/queue_options.ts";
import { Queue } from "@scribe/foundation/lib/src/queue/queue.ts";
import type {
  ChangeHandler,
  DeleteChange,
  FieldChange,
  FieldsChange,
  InsertChange,
  TriggerOp,
  UpdateChange,
} from "./trigger_change.ts";
import { type FieldOf, parsePath } from "./trigger_path.ts";
import { type FieldTransition, type RegisteredTrigger, triggerRegistry } from "./trigger_registry.ts";
import type { TriggerEvent } from "./trigger_event.ts";

/** The column a declaration takes as the identifier of a row when it names none. */
const DEFAULT_KEY = "id";

/**
 * The shape a change takes once it has left the types the body reads it through.
 *
 * The five methods hand five different objects to their bodies, and they are all built by one
 * function. It is the boundary where the types stop, so it is written down once here rather
 * than cast at each of the five call sites.
 */
// deno-lint-ignore no-explicit-any
type AnyChange = any;

/** What a declaration can say beyond its path. */
export interface TriggerOptions {
  /**
   * The name this declaration is registered under, and which its queue is derived from.
   *
   * The path decides it when absent, which is what a project wants until two declarations on
   * the same table and the same operation collide.
   */
  readonly name?: string;

  /** The column holding the identifier of one row. `id` when absent. */
  readonly key?: string;

  /** What the queue behind this declaration tunes, retries and concurrency among them. */
  readonly options?: QueueOptions;
}

/** The transition a column has to make, both bounds optional. */
export interface Transition<out V> {
  /** The value the column has to be leaving, any value when absent. */
  readonly from?: V;

  /** The value the column has to be reaching, any value when absent. */
  readonly to?: V;
}

/** A path, or the object carrying it when there is more to say. */
export type TriggerTarget<P extends string> = P | (TriggerOptions & { readonly path: P });

/** A path ending on a column, or the object carrying it and the transition to wait for. */
export type FieldTarget<TRow, P extends string> =
  | P
  | (TriggerOptions & {
    readonly path: P;
    readonly when?: Transition<TRow[FieldOf<TRow, P> & keyof TRow]>;
  });

/** A path on a table, and the columns watched under it. */
export type FieldsTarget<TRow, P extends string, F extends keyof TRow & string> = TriggerOptions & {
  readonly path: P;
  readonly observe: UnmodifiableList<F>;
};

/** What one declaration accumulated, before its name and its key were decided. */
interface Declaration {
  /** The path as it was written. */
  readonly path: string;

  /** The operation the method answers to. */
  readonly op: TriggerOp;

  /** The columns to watch, null when the method watches the row. */
  readonly observe: UnmodifiableList<string> | null;

  /** The transition a watched column has to make. */
  readonly when: FieldTransition | null;

  /** What the target said beyond its path. */
  readonly given: TriggerOptions;
}

/**
 * The five methods, bound to the type of the rows they hand over.
 *
 * @remarks
 * The row type is named once, by {@link Trigger.of}, and never on the call that declares. A
 * call names either all of its type arguments or none, so naming the row type on the
 * declaration itself would take the path out of inference, and with it the typed parameter,
 * the typed column and the typed transition, which are the whole point of writing the path as
 * a literal.
 */
export interface TriggerMethods<TRow extends object> {
  /** Fires once for every row written into the table the path names. */
  onInsert<const P extends string>(
    target: TriggerTarget<P>,
    handler: ChangeHandler<InsertChange<TRow, P>>,
  ): Trigger;

  /** Fires once for every write that leaves a row different from what it was. */
  onUpdate<const P extends string>(
    target: TriggerTarget<P>,
    handler: ChangeHandler<UpdateChange<TRow, P>>,
  ): Trigger;

  /** Fires once for every row removed from the table the path names. */
  onDelete<const P extends string>(
    target: TriggerTarget<P>,
    handler: ChangeHandler<DeleteChange<TRow, P>>,
  ): Trigger;

  /**
   * Fires when the column the path ends on holds a different value than it did.
   *
   * `update of <column>` fires on assignment and not on change, so `set status = status` would
   * reach the body. The comparison is made by the engine instead, which is what this method is
   * for.
   */
  onFieldChange<const P extends string>(
    target: FieldTarget<TRow, P>,
    handler: ChangeHandler<FieldChange<TRow, P, FieldOf<TRow, P> & keyof TRow>>,
  ): Trigger;

  /**
   * Fires once per watched column that moved, so a body reads which one from `change.field`.
   *
   * A write that moves two watched columns calls the body twice. There is no transition to
   * wait for here: two columns do not hold the same kind of value, so a single `when` could
   * not be typed against both.
   */
  onFieldsChange<const P extends string, const F extends keyof TRow & string>(
    target: FieldsTarget<TRow, P, F>,
    handler: ChangeHandler<FieldsChange<TRow, P, F>>,
  ): Trigger;
}

/**
 * A table trigger: declaring it and arming it are the same thing.
 *
 * ```ts
 * const orders = Trigger.of<OrdersRow>();
 *
 * export const onOrderCreated = orders.onInsert(
 *   "orders/{orderId}",
 *   async (change) => { await sendConfirmation(change.after, change.params.orderId); },
 * );
 * ```
 *
 * The project writes no SQL: the trigger sits on every table of `public`, and what a
 * declaration changes is a row in `__trigger_sources__`, written when the process boots.
 *
 * The row type is named explicitly, as `Queue<TJob>` takes its payload. The engine is not
 * allowed to know a project's schema, which is the same boundary that separates
 * `database/query/` from `database/gen/`.
 *
 * A declaration answers with the handle below, which most callers have no use for and may
 * discard: there is nothing left to call once it exists.
 */
export class Trigger {
  /** The name it is registered under, and which its queue is derived from. */
  readonly name: string;

  /** The table it observes. */
  readonly table: string;

  /** The column holding the identifier of one row. */
  readonly key: string;

  /** The operation it answers to. */
  readonly op: TriggerOp;

  /** The columns it watches, empty when it watches the row. */
  readonly fields: UnmodifiableList<string>;

  private constructor(registered: RegisteredTrigger) {
    this.name = registered.name;
    this.table = registered.table;
    this.key = registered.key;
    this.op = registered.op;
    this.fields = registered.fields;
  }

  /**
   * The five methods, bound to the type of the rows the table holds.
   *
   * ```ts
   * const orders = Trigger.of<OrdersRow>();
   * ```
   *
   * One handle serves a whole file, and nothing is armed until a method is called.
   */
  static of<TRow extends object>(): TriggerMethods<TRow> {
    return {
      onInsert(target, handler) {
        return Trigger.#arm(rowDeclaration(target, "insert"), handler as ChangeHandler<AnyChange>);
      },

      onUpdate(target, handler) {
        return Trigger.#arm(rowDeclaration(target, "update"), handler as ChangeHandler<AnyChange>);
      },

      onDelete(target, handler) {
        return Trigger.#arm(rowDeclaration(target, "delete"), handler as ChangeHandler<AnyChange>);
      },

      onFieldChange(target, handler) {
        return Trigger.#arm(fieldDeclaration(target), handler as ChangeHandler<AnyChange>);
      },

      onFieldsChange(target, handler) {
        return Trigger.#arm(
          { path: target.path, op: "update", observe: target.observe, when: null, given: target },
          handler as ChangeHandler<AnyChange>,
        );
      },
    };
  }

  /**
   * Registers a declaration and arms the queue that carries it.
   *
   * The queue is where everything this subject does not write itself comes from: durability,
   * the retry with its backoff, the dead letter, and the two endpoints that report on both.
   */
  static #arm(declaration: Declaration, handler: ChangeHandler<AnyChange>): Trigger {
    const parsed = parsePath(declaration.path);
    const fields = fieldsOf(declaration, parsed.field);
    const name = declaration.given.name ?? derivedName(parsed.table, declaration.op, fields);

    const registered: RegisteredTrigger = {
      name,
      table: parsed.table,
      key: declaration.given.key ?? DEFAULT_KEY,
      op: declaration.op,
      fields,
      when: declaration.when,
    };

    triggerRegistry.add(registered);

    new Queue<TriggerEvent>(
      { name: queueNameOf(name), options: declaration.given.options },
      async (event) => {
        await handler(changeOf(event, parsed.param));
      },
    );

    return new Trigger(registered);
  }
}

/** The declaration a column-watching method makes, from either shape of its target. */
function fieldDeclaration<TRow, P extends string>(target: FieldTarget<TRow, P>): Declaration {
  const given = typeof target === "string" ? {} : target;
  const path = typeof target === "string" ? target : target.path;
  const when = typeof target === "string" ? null : target.when ?? null;
  _refuseAStandingTransition(path, when);

  return { path, op: "update", observe: null, when, given };
}

/**
 * Refuses a transition whose two bounds name the same value.
 *
 * @remarks
 * A column that moved is a column holding something else than it held, so a body waiting to see
 * one go from a value to that same value is waiting for something the engine never reports. The
 * declaration is a mistake and it can only be found by noticing that a body never runs.
 *
 * @throws {DeclarationError} When `when` names one value on both sides.
 */
function _refuseAStandingTransition(path: string, when: FieldTransition | null): void {
  if (when === null || when.from === undefined || when.to === undefined) return;
  if (when.from !== when.to) return;

  throw new DeclarationError(
    `Trigger.onFieldChange("${path}"): this transition cannot fire. It waits for the column to `
      + `reach ${JSON.stringify(when.to)} while leaving the same value, and a column that moved `
      + "holds something else than it held.",
  );
}

/** The declaration a row-watching method makes, from either shape of its target. */
function rowDeclaration<P extends string>(target: TriggerTarget<P>, op: TriggerOp): Declaration {
  const given = typeof target === "string" ? {} : target;
  const path = typeof target === "string" ? target : target.path;

  return { path, op, observe: null, when: null, given };
}

/** The columns a declaration watches, refusing a path that says something else than its method. */
function fieldsOf(declaration: Declaration, field: string | null): UnmodifiableList<string> {
  if (declaration.observe !== null) {
    if (field !== null) {
      throw new DeclarationError(
        `Trigger.onFieldsChange("${declaration.path}"): the columns are named by "observe", ` +
          `so the path stops at the row.`,
      );
    }

    if (declaration.observe.length === 0) {
      throw new DeclarationError(`Trigger.onFieldsChange("${declaration.path}"): "observe" names no column.`);
    }

    return [...declaration.observe];
  }

  if (declaration.when !== null && field === null) {
    throw new DeclarationError(
      `Trigger.onFieldChange("${declaration.path}"): the path has to end on a column.`,
    );
  }

  return field === null ? [] : [field];
}

/** The name a declaration takes when it names none itself. */
function derivedName(table: string, op: TriggerOp, fields: UnmodifiableList<string>): string {
  if (fields.length === 0) return `${table}:${op}`;
  return `${table}:${[...fields].sort().join("+")}`;
}

/** The queue one declaration publishes on. */
export function queueNameOf(name: string): string {
  return `trigger:${name}`;
}

/** Builds what the body reads from what travelled through the queue. */
function changeOf(event: TriggerEvent, param: string): AnyChange {
  const base = {
    table: event.table,
    key: event.key,
    params: { [param]: event.key },
    at: DateTime.fromMillisecondsSinceEpoch(new Date(event.at).getTime()),
  };

  if (event.field === null) {
    return { ...base, before: event.before, after: event.after };
  }

  return {
    ...base,
    field: event.field,
    before: event.before?.[event.field] ?? null,
    after: event.after?.[event.field] ?? null,
    row: event.after,
  };
}
