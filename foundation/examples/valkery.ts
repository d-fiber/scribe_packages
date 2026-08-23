import { Duration } from "@scribe/alchemy";
import { Valkery } from "@scribe/foundation/lib/src/valkery/mod.ts";

/** What one entry of the session namespace holds. */
interface Session {
  /** The account the session was opened for. */
  readonly accountId: string;

  /** The display name, kept here so a read does not need the users table. */
  readonly name: string;
}

/**
 * One namespace, one type, one lifetime.
 *
 * `key` is the only field a declaration owes. Left out, `ttl` is fifteen days, which is the
 * answer for a namespace whose entries are correct at any age; a namespace whose values go
 * stale says how fast here rather than at each call site.
 */
export const sessions = new Valkery<Session>({ key: "session", ttl: Duration.minutes(5) });

/** Reads one entry, answering null on a miss and on an unreachable Redis alike. */
export function sessionOf(accountId: string): Promise<Session | null> {
  return sessions.get(accountId);
}

/** Reads a whole page of entries in one round trip instead of one per identifier. */
export function sessionsOf(accountIds: readonly string[]): Promise<(Session | null)[]> {
  return sessions.getMany(accountIds);
}

/** Writes an entry the caller already holds, which costs nothing to produce. */
export function remember(session: Session): Promise<void> {
  return sessions.add(session.accountId, session);
}

/**
 * Reads the entry, and produces it from the source when it is missing or stale.
 *
 * This is the call the two grouping stages and the early refresh are for: four concurrent
 * callers of one key cost a single read, and an entry close to its expiry is rebuilt by
 * whoever draws the short straw while the old value keeps being served.
 */
export function sessionOrLoad(accountId: string, load: () => Promise<Session>): Promise<Session> {
  return sessions.upsert(accountId, load);
}

/** Drops one entry, then a group of them. */
export async function forget(accountId: string, alsoDrop: readonly string[]): Promise<void> {
  await sessions.delete(accountId);
  await sessions.deleteMany(...alsoDrop);
}

/**
 * Empties the whole namespace, then the part of it a pattern names.
 *
 * The argument is a glob appended to the namespace, not a prefix: `"tenant:*"` clears
 * `session:tenant:*`, and `"tenant"` matches that one key exactly.
 */
export async function evict(): Promise<void> {
  await sessions.clear("tenant:*");
  await sessions.clear();
}
