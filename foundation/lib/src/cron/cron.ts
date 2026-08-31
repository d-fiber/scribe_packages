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

import { DateTime, Duration } from "@scribe/alchemy";
import { wholeMinutes } from "./whole_minutes.ts";
import { nextRun } from "./next_run.ts";
import { cronRegistry } from "./cron_registry.ts";
import { cronRunner } from "./cron_runner.ts";
import type { CronHandler, Schedule, Scheduled } from "./schedule.ts";

const _DEFAULT_TIMEOUT = Duration.minutes(10);

/** What declaring a periodic job takes. */
export interface CronDefinition {
  /**
   * The name this job is registered under.
   *
   * It has to be unique across the process, because it is what identifies an occurrence
   * from one replica to the next.
   */
  readonly name: string;

  /**
   * When this job runs, as one of the three schedule shapes.
   *
   * A fixed interval, a cron expression, or a daily time in a named timezone each answer "when is
   * the next run" differently, so the shape carries which one a job declared rather than the
   * runner having to guess from the value alone.
   */
  readonly schedule: Schedule;

  /**
   * How long the body is given, and how long the occurrence stays claimed.
   *
   * Left out, ten minutes. It is refused outright unless it is a whole number of minutes: the
   * claim that reserves an occurrence for one replica is derived from the interval, and a value
   * that does not divide evenly into minutes would round differently depending on when a
   * replica's clock happens to read it, letting two replicas both believe they hold the claim and
   * run the same occurrence twice.
   */
  readonly timeout?: Duration;
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
  /** The name this job was declared under, and the identifier `cronRegistry` and `cronRunner` both key it by. */
  readonly name: string;

  /** When this job fires, as the definition named it, kept so {@link nextRun} can be answered without going back to the definition. */
  readonly schedule: Schedule;

  /** How long a claimed occurrence stays claimed, defaulted and rounded from the definition. */
  readonly timeout: Duration;

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

  /**
   * When this job next runs, computed fresh from the current time on every call rather than
   * cached, since a job that has already run once needs the answer to move forward past that
   * occurrence and a cached value would repeat the same run forever.
   */
  nextRun(): Date {
    return nextRun(this.schedule, _now());
  }
}

/** What time it is, as croner wants it: the clock is the slot's, the shape is the platform's. */
function _now(): Date {
  return new Date(DateTime.now().millisecondsSinceEpoch);
}
