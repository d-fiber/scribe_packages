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
  Cron as PortCron,
  CronDriver,
  CronOptions,
  Schedule as PortSchedule,
  TimeOfDay as PortTimeOfDay,
} from "@scribe/alchemy";
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
  /** The run `options` names, armed on the first ask and kept from then on. */
  schedule(options: CronOptions): PortCron {
    const held = _armed.get(options.key);
    if (held !== undefined) return held;

    const declared = new Cron(
      { name: options.key, schedule: _translated(options.schedule, options.timezone) },
      () => Promise.resolve(options.run()),
    );
    const armed: PortCron = { key: declared.name, schedule: options.schedule };

    _armed.set(options.key, armed);
    return armed;
  }
}

/**
 * The schedule the port named, said in the three shapes this package understands.
 *
 * @remarks
 * The port names a time of day as an hour and a minute, and this package names it as the text a
 * calendar reads, so the driver writes the text. It is the only place the two ways of saying it
 * meet, which is what keeps every other file speaking one of them.
 *
 * A zone the port did not name is read as UTC. Guessing the deployment's would make the same
 * declaration fire at different hours on two machines, and a package that cares says so.
 *
 * @throws {DeclarationError} When `schedule` names none of the three, and when the value it names
 * is one the shape refuses.
 */
function _translated(schedule: PortSchedule, timezone?: string): Schedule {
  const zone = _zoneNamed(timezone);

  if ("every" in schedule) return every(schedule.every as Duration);
  if ("at" in schedule) return at(zone, _asText(schedule.at));
  if ("expression" in schedule) {
    return cronExpression(
      schedule.expression as `${string} ${string} ${string} ${string} ${string}`,
      zone,
    );
  }

  throw new DeclarationError("a schedule names an interval, a time of day or an expression.");
}

/**
 * The zone `timezone` names, or UTC when it names none.
 *
 * @remarks
 * The port takes a zone as free text and this package reads a list of them. A name that is not on
 * the list is refused here, where the message can say the declaration is wrong, rather than
 * further down where the calendar refuses it as a value out of range and names neither the
 * declaration nor the zone.
 *
 * @throws {DeclarationError} When `timezone` names a zone this package does not read.
 */
function _zoneNamed(timezone?: string): CronTimezone {
  if (timezone === undefined) return CronTimezone.Utc;
  if (_read.has(timezone)) return timezone as CronTimezone;

  throw new DeclarationError(
    `"${timezone}" is not a zone this package reads. Name one of the zones CronTimezone lists, or ` +
      "leave it out and the run is read in UTC.",
  );
}

const _read: ReadonlySet<string> = new Set(Object.values(CronTimezone));

/** An hour and a minute, written the way a calendar reads them. */
function _asText(when: PortTimeOfDay): `${number}:${number}` {
  const hour = String(when.hour).padStart(2, "0");
  const minute = String(when.minute ?? 0).padStart(2, "0");

  return `${hour}:${minute}` as `${number}:${number}`;
}

/**
 * One run per key, so declaring twice answers the same one rather than firing twice.
 *
 * @remarks
 * It lives beside the class and not inside an instance, because what a declaration writes to is
 * process-global: a host that clears the slot and wires a second driver would meet a registry
 * that already holds the first driver's keys, and every declaration made before the clear would
 * be refused as a duplicate.
 */
const _armed: Map<string, PortCron> = new Map();
