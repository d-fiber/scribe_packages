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

/** What declaring a periodic job takes. */
export interface CronDefinition {
  readonly name: string;
  readonly schedule: Schedule;
  /**
   * How long the body is given, and how long the occurrence stays claimed.
   *
   * Left out, ten minutes. It has to be a whole number of minutes, for the reason
   * `core/duration.ts` gives.
   */
  readonly timeout?: Time;
}

/**
 * A periodic job: declaring it and arming it are the same thing.
 *
 * ```ts
 * new Cron({ name: "digest", schedule: at(CronTimezone.EuropeParis, "08:00") }, handler);
 * ```
 *
 * The framework declares none of its own — the engine runs, the catalogue is entirely the
 * project's. Constructing one registers it and arms it on the runner; the object answers when
 * it next runs, which most callers have no use for and may discard.
 */
export class Cron implements Scheduled {
  readonly name: string;
  readonly schedule: Schedule;
  readonly timeout: Time;

  constructor(definition: CronDefinition, handler: CronHandler) {
    this.name = definition.name;
    this.schedule = definition.schedule;
    this.timeout = definition.timeout
      ? wholeMinutes(`new Cron("${definition.name}") timeout`, definition.timeout)
      : _DEFAULT_TIMEOUT;

    cronRegistry.add({ job: this, nextRun: () => this.nextRun() });
    cronRunner.register(this, handler);
  }

  /** When this job next runs. */
  nextRun(): Date {
    return nextRun(this.schedule, new Date());
  }
}
