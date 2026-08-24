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

import { Duration, type Future } from "@scribe/alchemy";
import { log } from "@scribe/alchemy/observe";
import { kv } from "@scribe/foundation/lib/src/redis/kv.ts";
import { nextRunAfterSlot } from "@scribe/foundation/lib/src/cron/next_run.ts";
import type { Scheduled } from "@scribe/foundation/lib/src/cron/schedule.ts";

/**
 * Claims one occurrence of one job, for the whole fleet.
 *
 * It is a marker rather than a mutex: it is never released, it expires. Holding it for as long
 * as the occurrence it names is current is what tells every other replica that this one is
 * spoken for, and what frees it on its own if the replica that took it dies.
 */
export class SlotLock {
  /**
   * The key one occurrence is claimed under.
   *
   * An interval is floored to a multiple of itself so that two replicas whose clocks differ by
   * a few hundred milliseconds compute the **same** key; without the flooring each would claim
   * its own and the job would run twice. A calendar occurrence is already exact.
   *
   * The flooring is a safety net and not what makes the fleet agree. What does is that an
   * interval's occurrences are placed on the grid of the epoch by `nextRun`, so two replicas
   * registering the same job at different moments name the same instants and not two series a
   * fraction of a period apart.
   */
  keyFor(job: Scheduled, slot: Date): string {
    const at = job.schedule.kind === "interval"
      ? _flooredTo(slot.getTime(), job.schedule.every.inMilliseconds)
      : slot.getTime();

    return `cron:lock:${job.name}:${at}`;
  }

  /**
   * Takes the occurrence if nobody has, and answers whether this replica may run it.
   *
   * An unreachable Redis answers no. Losing an occurrence is preferable to running it once
   * per replica, and preferable to bringing the loop down with it.
   */
  async claim(job: Scheduled, slot: Date): Future<boolean> {
    try {
      const claimed = await kv().set(
        this.keyFor(job, slot),
        "1",
        "PX",
        this.leaseFor(job, slot).inMilliseconds,
        "NX",
      );
      if (claimed === "OK") return true;
      if (claimed !== null) {
        log.error("cron-runner.lock_answered_oddly", {
          metadata: {
            job: job.name,
            answered: String(claimed),
            consequence: "this occurrence is skipped",
          },
        });
      }
      return false;
    } catch (error) {
      log.error("cron-runner.lock_unavailable", {
        metadata: { job: job.name, consequence: "this occurrence is skipped", error },
      });
      return false;
    }
  }

  /**
   * How long the marker of `slot` is held, which is how long that occurrence stays spoken for.
   *
   * @remarks
   * It is the gap to the next occurrence, because that is what the key names: the marker stands
   * for one occurrence, and the next replica to reach the same one has to find it still there.
   * The job's timeout is a different quantity, and a shorter one on any schedule that runs less
   * often than it takes: taking it as the lease frees the marker while its own occurrence is
   * still current, and the next replica to arrive claims what has already run.
   *
   * The timeout is the floor rather than the value, so a run that outlives its own occurrence
   * still holds what it is working on.
   */
  leaseFor(job: Scheduled, slot: Date): Duration {
    const untilNext = nextRunAfterSlot(job.schedule, slot, slot).getTime() - slot.getTime();
    return Duration.milliseconds(Math.max(untilNext, job.timeout.inMilliseconds));
  }
}

/** `at` brought down to the nearest whole multiple of `step`, so two clocks agree on one key. */
function _flooredTo(at: number, step: number): number {
  return Math.floor(at / step) * step;
}
