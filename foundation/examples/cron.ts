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

import { Duration, Future } from "@scribe/alchemy";
import { Cron } from "../lib/src/cron/cron.ts";
import { at } from "../lib/src/cron/daily_schedule.ts";
import { cronExpression } from "../lib/src/cron/cron_expression.ts";
import { every } from "../lib/src/cron/interval_schedule.ts";
import { CronTimezone } from "../lib/src/cron/cron_timezone.ts";

/**
 * A job that runs on a wall clock, in the timezone it names.
 *
 * Declaring it arms it. The framework declares none of its own: the engine runs and the
 * catalogue belongs to the project. The handle answers when the job next runs, which most
 * callers have no use for and may discard.
 */
export const digest = new Cron(
  { name: "daily-digest", schedule: at(CronTimezone.EuropeParis, "08:00") },
  () => sendDigest(),
);

/** Several times a day, from one declaration. */
export const reconcile = new Cron(
  { name: "reconcile", schedule: at(CronTimezone.EuropeParis, "06:00", "18:00") },
  () => reconcileOrders(),
);

/**
 * A job that runs on an interval rather than on a calendar.
 *
 * The interval is rounded to whole minutes, because that is what the replicas agree on when
 * they claim an occurrence.
 */
export const sweep = new Cron(
  { name: "sweep-expired", schedule: every(Duration.minutes(15)), timeout: Duration.minutes(2) },
  () => dropExpired(),
);

/** A schedule a calendar shape cannot express, written as an expression. */
export const monthly = new Cron(
  { name: "monthly-invoices", schedule: cronExpression("0 3 1 * *", CronTimezone.Utc) },
  () => invoice(),
);

/** When the digest next runs, which is what the handle is for. */
export function nextDigest(): Date {
  return digest.nextRun();
}

/** Builds the digest and hands it to whatever sends mail. */
function sendDigest(): Future<void> {
  return Future.value(undefined);
}

/** Walks the orders that are not settled and settles what can be. */
function reconcileOrders(): Future<void> {
  return Future.value(undefined);
}

/** Removes what has outlived whatever kept it. */
function dropExpired(): Future<void> {
  return Future.value(undefined);
}

/** Bills the period that has just closed. */
function invoice(): Future<void> {
  return Future.value(undefined);
}
