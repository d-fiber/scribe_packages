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

import { realtimeEvents } from "../db/tables.ts";
import type { RealtimeRow, RealtimeTransport } from "./transport.ts";

/**
 * How many emissions one insert carries at most.
 *
 * A burst larger than this is split rather than sent as one statement, so that a single
 * request body stays bounded whatever a caller does in one tick.
 */
const BATCH_LIMIT = 500;

/** One emission waiting for its batch to leave, and the caller waiting on the answer. */
interface PendingEmission {
  /** The row as the log stores it, already addressed. */
  readonly row: {
    /** The full channel the row is addressed to. */
    channel: string;

    /** What happened, as the declaration named it. */
    action: string;

    /** The identifier of the row the event is about. */
    entity_id: string;

    /** What travels, as the declaration's type describes it. */
    payload: Record<string, unknown>;
  };

  /** Answers the caller of `send` once the insert this row travelled in came back. */
  readonly settle: (sent: boolean) => void;
}

/**
 * Writes an emission into the log Postgres broadcasts from.
 *
 * @remarks
 * Nothing is pushed from here. The row lands in `__realtime_events__`, and the trigger on
 * that table calls `realtime.send` with the mode the channel's declared openness asks for. The
 * same row also serves the catch-up a client runs on reconnection, which reads identifiers
 * rather than payloads.
 *
 * Emissions written in the same tick travel in one insert, which is where the cost of a burst
 * sits: three hundred events used to pay three hundred round trips to PostgREST, and the trigger
 * fires per row either way. The rows keep the order they were sent in, since the sequence
 * assigns identifiers in the order of the array and the catch-up breaks ties on that identifier.
 * A caller that awaits each emission is unaffected, its batch holding one row.
 */
export class EventLogTransport implements RealtimeTransport {
  /** The emissions written this tick, in the order they were sent. */
  #pending: PendingEmission[] = [];

  /** Whether a flush is already queued for the end of this tick. */
  #scheduled = false;

  /** Sends `row` by writing it, and answers whether the insert it travelled in went through. */
  send(row: RealtimeRow): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.#pending.push({
        row: {
          channel: row.channel,
          action: row.action,
          entity_id: row.entityId,
          payload: row.payload,
        },
        settle: resolve,
      });

      if (this.#pending.length >= BATCH_LIMIT) {
        this.#flush();
        return;
      }

      if (!this.#scheduled) {
        this.#scheduled = true;
        queueMicrotask(() => this.#flush());
      }
    });
  }

  #flush(): void {
    this.#scheduled = false;
    const batch = this.#pending;
    if (batch.length === 0) return;
    this.#pending = [];

    realtimeEvents()
      .insert(batch.map((one) => one.row))
      .then((sent) => {
        for (const one of batch) one.settle(sent);
      })
      .catch((error: unknown) => {
        console.error("[realtime] the event log refused a batch of emissions.", error);
        for (const one of batch) one.settle(false);
      });
  }
}
