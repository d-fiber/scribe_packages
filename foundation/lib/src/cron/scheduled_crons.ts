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

import type { Cron as PortCron, CronDriver, CronOptions, Schedule as PortSchedule } from "@scribe/alchemy";
import { DeclarationError, Duration } from "@scribe/alchemy";
import { Cron } from "./cron.ts";
import { CronTimezone } from "./cron_timezone.ts";
import { cronExpression } from "./cron_expression.ts";
import { at } from "./daily_schedule.ts";
import { every } from "./interval_schedule.ts";
import type { Schedule } from "./schedule.ts";

/**
 * What arms a scheduled run for a package that asked the port for one.
 *
 * @remarks
 * The port names a schedule with one of three fields, and this package names it with a tagged
 * union of three shapes, so the driver translates. It is the only place the two vocabularies
 * meet, which is what keeps every other file speaking one of them.
 *
 * A calendar time is read in UTC. The port carries no zone, and guessing the deployment's would
 * make the same declaration fire at different hours on two machines.
 */
export class ScheduledCrons implements CronDriver {
  /** One run per key, so declaring twice answers the same one rather than firing twice. */
  readonly #armed = new Map<string, PortCron>();

  /** The run `options` names, armed on the first ask and kept from then on. */
  schedule(options: CronOptions): PortCron {
    const held = this.#armed.get(options.key);
    if (held !== undefined) return held;

    const declared = new Cron(
      { name: options.key, schedule: _translated(options.schedule) },
      () => Promise.resolve(),
    );
    const armed: PortCron = { key: declared.name, schedule: options.schedule };

    this.#armed.set(options.key, armed);
    return armed;
  }
}

/**
 * The schedule the port named, said in the three shapes this package understands.
 *
 * @remarks
 * The port types a time of day and an expression as plain text where this package types the shape
 * they must have. The conversion is safe because it is the callee that decides: `at` refuses
 * anything that is not a 24-hour `HH:MM`, and `cronExpression` parses eagerly and refuses at the
 * declaration. Both raise where the declaration is written rather than at the first occurrence.
 *
 * @throws {DeclarationError} When `schedule` names none of the three, and when the value it names
 * is not one the shape accepts.
 */
function _translated(schedule: PortSchedule): Schedule {
  if ("every" in schedule) return every(schedule.every as Duration);
  if ("at" in schedule) return at(CronTimezone.Utc, schedule.at as unknown as `${number}:${number}`);
  if ("expression" in schedule) {
    return cronExpression(
      schedule.expression as unknown as `${string} ${string} ${string} ${string} ${string}`,
      CronTimezone.Utc,
    );
  }

  throw new DeclarationError("a schedule names an interval, a time of day or an expression.");
}
