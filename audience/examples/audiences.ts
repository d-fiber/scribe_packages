import { Duration } from "@scribe/alchemy";
import { Audience, audiencesOf } from "@scribe/audience/mod.ts";

/**
 * A named set with one membership list for the whole process.
 *
 * There is no scope to name, so the members are asked for directly.
 */
export const banned = Audience.plain("banned");

/**
 * A named set with one membership list per scope.
 *
 * `in` is what picks the list, and the scope is whatever the project keys the right on: a
 * project, a tenant, a document.
 */
export const editors = Audience.keyed("project-editors");

/**
 * A set whose memberships expire on their own.
 *
 * Naming the lifetime on the declaration is what makes a right nobody remembers to take back
 * impossible: every caller inherits it, and a caller that wants otherwise says so per member.
 */
export const invited = Audience.keyed("project-invited", { ttl: Duration.days(7) });

/** Whether an account is in the plain set. */
export function isBanned(accountId: string): Promise<boolean> {
  return banned.has(accountId);
}

/** Whether it is in the list one scope holds. */
export function edits(projectId: string, accountId: string): Promise<boolean> {
  return editors.in(projectId).has(accountId);
}

/** A scope may be nested, which keys the list on the whole path rather than on the first part. */
export function editsBackend(projectId: string, accountId: string): Promise<boolean> {
  return editors.in(projectId, "backend").has(accountId);
}

/** Puts a member in for the lifetime the declaration names. */
export async function invite(projectId: string, accountId: string): Promise<boolean> {
  const result = await invited.in(projectId).add(accountId);
  return result.ok;
}

/**
 * Puts one in for good, past what the declaration says.
 *
 * Null and absent are two answers on purpose: absent means the declaration decides, and null
 * means this member stays.
 */
export async function inviteForGood(projectId: string, accountId: string): Promise<boolean> {
  const result = await invited.in(projectId).add(accountId, { ttl: null });
  return result.ok;
}

/** Pushes one membership out without writing it again. */
export async function renew(projectId: string, accountId: string): Promise<boolean> {
  const result = await invited.in(projectId).ttl(accountId, Duration.days(7));
  return result.ok;
}

/** Takes one member out, then empties the whole list. */
export async function close(projectId: string, accountId: string): Promise<boolean> {
  await invited.in(projectId).remove(accountId);
  const cleared = await invited.in(projectId).clear();
  return cleared.ok;
}

/** Who is in one list. */
export function invitees(projectId: string): Promise<string[]> {
  return invited.in(projectId).members();
}

/** Which of the declared sets one account belongs to, asked once instead of set by set. */
export function setsOf(accountId: string): Promise<string[]> {
  return audiencesOf(accountId);
}
