import { Duration } from "@scribe/alchemy";
import { BanError } from "@scribe/auth/mod.ts";
import { user } from "./declaration.ts";

/**
 * Shutting an account out until somebody lets it back in.
 *
 * A ban with no deadline is the default on purpose: one that lifts by itself has to be asked
 * for, never walked into.
 */
export async function shutOut(accountId: string, reason: string): Promise<string | null> {
  const laid = await user.bans.lay(accountId, { reason });
  if (laid.ok) return null;

  return laid.error === BanError.NotFound ? "no account of this role has that identifier" : "could not lay the ban";
}

/** Shutting one out for a week, after which it lifts on its own. */
export async function shutOutForAWeek(accountId: string, reason: string): Promise<boolean> {
  const laid = await user.bans.lay(accountId, { for: Duration.days(7), reason });
  return laid.ok;
}

/** Letting one back in, whether its ban had a deadline or not. */
export async function letBackIn(accountId: string): Promise<boolean> {
  const lifted = await user.bans.lift(accountId);
  return lifted.ok;
}

/** Whether a ban stands, and what it says. A deadline that has passed answers null. */
export async function standingOver(accountId: string): Promise<string | null> {
  const ban = await user.bans.of(accountId);
  if (ban === null) return null;

  return ban.until === null
    ? `${ban.reason ?? "no reason"}, indefinitely`
    : `${ban.reason ?? "no reason"}, until ${ban.until}`;
}

/** Every ban standing right now, for a screen that lists them. */
export function allStanding(): Promise<readonly { accountId: string; reason: string | null }[]> {
  return user.bans.standing();
}
