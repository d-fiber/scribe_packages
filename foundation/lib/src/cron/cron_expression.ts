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

import type { CronTimezone } from "./cron_timezone.ts";
import { DeclarationError } from "@scribe/alchemy";
import { Cron } from "croner";

/** A five-field cron expression. */
export type CronExpression = `${string} ${string} ${string} ${string} ${string}`;

/** A job placed on the calendar by a cron expression. */
export interface CronExpressionSchedule {
  /** What tells this schedule from an interval or a daily time. */
  readonly kind: "cron";

  /** The expression as it was declared, kept for the status endpoint and the report. */
  readonly expression: CronExpression;

  /** The zone {@link expression} is read in. */
  readonly timezone: CronTimezone;

  /**
   * The croner job built from {@link expression}, once.
   *
   * Rebuilding it to answer a single question would parse the expression again on every tick.
   */
  readonly job: Cron;
}

/**
 * Runs the job on the occurrences a cron expression names, in `timezone`.
 *
 * The `Cron` object is built here, once, and kept on the schedule. Rebuilding it to answer
 * every "when is the next one" would parse the expression on each tick of the runner.
 */
export function cronExpression(
  expression: CronExpression,
  timezone: CronTimezone,
): CronExpressionSchedule {
  _refuseWhatTheTypeDoesNotDeclare(expression);
  const job = new Cron(expression, { timezone });
  _refuseWhatNeverComes(expression, job);

  return { kind: "cron", expression, timezone, job };
}

/**
 * Refuses an expression that is not the five fields this type declares.
 *
 * @remarks
 * croner reads six fields, the first of them seconds, so an expression opening on a seconds
 * field builds a schedule that runs every few seconds. The runner floors nothing below a minute, so such a job would be
 * claimed once a minute and its declaration would be quietly wrong.
 *
 * @throws {DeclarationError} When `expression` does not hold exactly five fields.
 */
function _refuseWhatTheTypeDoesNotDeclare(expression: string): void {
  const fields = expression.trim().split(/\s+/).filter((field) => field !== "");
  if (fields.length === 5) return;

  throw new DeclarationError(
    `cronExpression("${expression}"): a cron expression here is five fields, minute to weekday. ` +
      `This one holds ${fields.length}. A sixth field is read as seconds, and nothing under a ` +
      "minute is scheduled.",
  );
}

/**
 * Refuses an expression that parses but names no occurrence.
 *
 * @remarks
 * The thirtieth of February parses, so the refusal used to land on the first tick that asked for
 * a next run rather than on the line that declared it, far from whoever wrote it. A zone croner
 * does not know is the same case, and is refused here for the same reason.
 *
 * @throws {DeclarationError} When `expression` names a date the calendar never reaches, or when
 * asking for one raises.
 */
function _refuseWhatNeverComes(expression: string, job: Cron): void {
  let next: Date | null;

  try {
    next = job.nextRun();
  } catch (raised) {
    throw new DeclarationError(
      `cronExpression("${expression}"): this schedule cannot be asked when it next runs. ${
        raised instanceof Error ? raised.message : String(raised)
      }`,
    );
  }

  if (next === null) {
    throw new DeclarationError(
      `cronExpression("${expression}"): this expression names no date the calendar ever reaches.`,
    );
  }
}
