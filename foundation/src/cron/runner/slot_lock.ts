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

import { kv } from "@scribe/foundation/src/redis/mod.ts";
import type { Scheduled } from "@scribe/foundation/src/cron/schedule/mod.ts";

/**
 * Claims one occurrence of one job, for the whole fleet.
 *
 * It is a marker rather than a mutex: it is never released, it expires. Holding it for the
 * job's timeout is what tells every other replica that this occurrence is spoken for, and
 * what frees it on its own if the replica that took it dies.
 */
export class SlotLock {
  /**
   * The key one occurrence is claimed under.
   *
   * An interval is floored to a multiple of itself so that two replicas whose clocks differ
   * by a few hundred milliseconds compute the **same** key; without the flooring each would
   * claim its own and the job would run twice. A calendar occurrence is already exact.
   */
  keyFor(job: Scheduled, slot: Date): string {
    const at = job.schedule.kind === "interval"
      ? Math.floor(slot.getTime() / job.schedule.ms) * job.schedule.ms
      : slot.getTime();

    return `cron:lock:${job.name}:${at}`;
  }

  /**
   * Takes the occurrence if nobody has, and answers whether this replica may run it.
   *
   * An unreachable Redis answers no. Losing an occurrence is preferable to running it once
   * per replica, and preferable to bringing the loop down with it.
   */
  async claim(job: Scheduled, slot: Date): Promise<boolean> {
    try {
      const claimed = await kv().set(
        this.keyFor(job, slot),
        "1",
        "PX",
        job.timeout.ms,
        "NX",
      );
      return claimed === "OK";
    } catch (error) {
      console.error(
        `[cron-runner] "${job.name}" lock unavailable, skipped:`,
        error,
      );
      return false;
    }
  }
}
