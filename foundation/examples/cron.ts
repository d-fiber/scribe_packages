import { Duration } from "@scribe/alchemy";
import { at, Cron, cronExpression, CronTimezone, every } from "@scribe/foundation/lib/src/cron/mod.ts";

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

function sendDigest(): Promise<void> {
  return Promise.resolve();
}

function reconcileOrders(): Promise<void> {
  return Promise.resolve();
}

function dropExpired(): Promise<void> {
  return Promise.resolve();
}

function invoice(): Promise<void> {
  return Promise.resolve();
}
