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
