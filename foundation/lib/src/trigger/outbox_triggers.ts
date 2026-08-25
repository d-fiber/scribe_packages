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

import type {
  DeleteChange as PortDelete,
  FieldChange as PortField,
  InsertChange as PortInsert,
  Transition,
  Trigger as PortTrigger,
  TriggerDriver,
  TriggerOptions as PortOptions,
  UpdateChange as PortUpdate,
} from "@scribe/alchemy";
import type { Future, QueueOptions as PortQueueOptions } from "@scribe/alchemy";
import type { QueueOptions } from "../queue/queue_options.ts";
import { Trigger } from "./trigger.ts";

/** The column a table is keyed on when a declaration does not say. */
const DEFAULT_KEY = "id";

/**
 * What watches a table for a package that asked the port for one.
 *
 * @remarks
 * This package names what it watches with a path, `orders/{id}`, because a path carries the key
 * column and the field in one string. The port names a table and a key separately, so the driver
 * builds the path from the two. It is the only place the two ways of naming meet.
 *
 * A change crosses the same boundary. What this package hands a body carries the path parameters
 * it parsed; what the port promises carries the operation as a discriminant instead. Neither is
 * a superset of the other, so each change is rebuilt rather than passed on. A column that moved
 * is an update there: the port names three operations and a write is what makes a column move.
 */
export class OutboxTriggers implements TriggerDriver {
  /** The watch `table` and `options` name, declared on the first ask. */
  watch<TRow>(table: string, options?: PortOptions): PortTrigger<TRow> {
    const key = options?.key ?? DEFAULT_KEY;
    const path = `${table}/{${key}}` as const;
    const said = { name: options?.name, key, options: _tunedBy(options?.queue) };
    const methods = Trigger.of<TRow & object>();

    const watched: PortTrigger<TRow> = {
      onInsert(handle): PortTrigger<TRow> {
        methods.onInsert(
          { ...said, path },
          (change) => handle({ ...change, op: "insert" } as PortInsert<TRow>),
        );
        return watched;
      },
      onUpdate(handle): PortTrigger<TRow> {
        methods.onUpdate(
          { ...said, path },
          (change) => handle({ ...change, op: "update" } as PortUpdate<TRow>),
        );
        return watched;
      },
      onDelete(handle): PortTrigger<TRow> {
        methods.onDelete(
          { ...said, path },
          (change) => handle({ ...change, op: "delete" } as PortDelete<TRow>),
        );
        return watched;
      },
      onField<F extends keyof TRow>(
        field: F,
        handle: (change: PortField<TRow, F>) => void | Future<void>,
        moving?: Transition<TRow[F]>,
      ): PortTrigger<TRow> {
        methods.onFieldChange(
          { ...said, path: `${path}/${String(field)}`, when: moving } as never,
          ((change: unknown) =>
            handle({ ...(change as object), op: "update" } as unknown as PortField<TRow, F>)) as never,
        );
        return watched;
      },
    };

    return watched;
  }
}

/**
 * The queue tuning the port named, said the way this package tunes a queue.
 *
 * @remarks
 * The port counts deliveries and this package counts retries under the same names as its own
 * queues, so the two are translated here rather than at each of the four call sites. A watch that
 * tuned nothing leaves the queue on the defaults its declaration carries.
 */
function _tunedBy(queue?: PortQueueOptions): QueueOptions | undefined {
  if (queue === undefined) return undefined;

  return { maxRetries: queue.attempts ?? 1, processingTimeout: queue.visibility };
}
