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

import { Time } from "@scribe/core/contracts/common/time.ts";
import { wholeMinutes } from "@scribe/foundation/src/cron/core/duration.ts";
import { nextRun } from "@scribe/foundation/src/cron/core/next_run.ts";
import { cronRegistry } from "@scribe/foundation/src/cron/core/registry.ts";
import { cronRunner } from "@scribe/foundation/src/cron/runner/cron_runner.ts";
import type { CronHandler, Schedule, Scheduled } from "@scribe/foundation/src/cron/schedule/mod.ts";

const _DEFAULT_TIMEOUT = Time.minutes(10);

/** What declaring a job takes. */
export interface CronDefinition {
  readonly name: string;
  readonly schedule: Schedule;
  readonly timeout?: Time;
}

/** A declared job, plus the ability to ask when it next runs. */
export interface CronJob extends Scheduled {
  nextRun(): Date;
}

/**
 * Declares a periodic job and its body in one call.
 *
 * The framework declares none of its own: the engine runs, the catalogue is entirely the
 * project's. `defineCron` is the primitive, a given job is not.
 *
 * The timeout serves twice — it is the deadline the body is given, and the lifetime of the
 * Redis key that marks the occurrence as claimed. A replica that dies mid-run therefore
 * releases the occurrence by expiry rather than holding it for good.
 */
export function defineCron(
  definition: CronDefinition,
  handler: CronHandler,
): CronJob {
  const job: Scheduled = {
    name: definition.name,
    schedule: definition.schedule,
    timeout: definition.timeout
      ? wholeMinutes(
        `defineCron("${definition.name}") timeout`,
        definition.timeout,
      )
      : _DEFAULT_TIMEOUT,
  };

  const entry: CronJob = {
    ...job,
    nextRun: () => nextRun(job.schedule, new Date()),
  };

  cronRegistry.add({ job, nextRun: entry.nextRun });
  cronRunner.register(job, handler);

  return entry;
}
