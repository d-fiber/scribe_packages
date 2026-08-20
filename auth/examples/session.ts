import { SessionError } from "@scribe/auth/mod.ts";
import { user } from "./declaration.ts";

/**
 * Buying a new access token, which answers the same thing twice in a row.
 *
 * A client that retries on a slow answer gets the session it was already handed rather than a
 * second one, for the fifteen seconds a retry lands in.
 */
export async function refresh(refreshToken: string): Promise<string | null> {
  const renewed = await user.session.refresh(refreshToken);
  return renewed.ok ? renewed.data.access_token : null;
}

/**
 * Opening on whatever tokens a client still holds.
 *
 * The access token is tried first because it costs nothing when it is still good, which keeps a
 * client that opens on a warm token from rotating its refresh token for no reason.
 */
export async function open(accessToken: string, refreshToken: string): Promise<string | null> {
  const recovered = await user.session.recover(accessToken, refreshToken);
  return recovered.ok ? recovered.data.access_token : null;
}

/** Ending the session this request came with, and everything that remembered it. */
export async function signOut(): Promise<string | null> {
  const ended = await user.session.signOut();
  if (ended.ok) return null;

  return ended.error === SessionError.Unauthorized ? "not signed in" : "could not sign out";
}

/**
 * Giving up the account, which takes its devices and its rows with it.
 *
 * Nothing here names the project's own tables: they go by the foreign keys that point at the
 * account.
 */
export async function deleteAccount(): Promise<boolean> {
  const gone = await user.session.delete();
  return gone.ok;
}
