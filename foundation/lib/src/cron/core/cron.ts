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

import { Time } from "@scribe/core/contracts/common/time.ts";
import { wholeMinutes } from "@scribe/foundation/lib/src/cron/core/duration.ts";
import { nextRun } from "@scribe/foundation/lib/src/cron/core/next_run.ts";
import { cronRegistry } from "@scribe/foundation/lib/src/cron/core/registry.ts";
import { cronRunner } from "@scribe/foundation/lib/src/cron/runner/cron_runner.ts";
import type {
  CronHandler,
  Schedule,
  Scheduled,
} from "@scribe/foundation/lib/src/cron/schedule/mod.ts";

const _DEFAULT_TIMEOUT = Time.minutes(10);

/** What declaring a periodic job takes. */
export interface CronDefinition {
  /**
   * The name this job is registered under.
   *
   * It has to be unique across the process, because it is what identifies an occurrence
   * from one replica to the next.
   */
  readonly name: string;

  /** When this job runs, as one of the three schedule shapes. */
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
 * The framework declares none of its own: the engine runs, and the catalogue is entirely the
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
      ? wholeMinutes(
          `new Cron("${definition.name}") timeout`,
          definition.timeout,
        )
      : _DEFAULT_TIMEOUT;

    cronRegistry.add({ job: this, nextRun: () => this.nextRun() });
    cronRunner.register(this, handler);
  }

  /** When this job next runs. */
  nextRun(): Date {
    return nextRun(this.schedule, new Date());
  }
}
