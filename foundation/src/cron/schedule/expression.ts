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

import type { CronTimezone } from "@scribe/foundation/src/cron/timezone.ts";
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
  return {
    kind: "cron",
    expression,
    timezone,
    job: new Cron(expression, { timezone }),
  };
}
