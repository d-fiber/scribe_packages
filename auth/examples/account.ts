import { IdentifierError, PasswordError } from "@scribe/auth/mod.ts";
import { user } from "./declaration.ts";

/**
 * Reading an account with everything the declaration folds in.
 *
 * One PostgREST request, however many tables hang off it: the foreign keys are what let them be
 * folded, and the names come from the shape `get` was written as, not from the columns.
 */
export async function profileOf(accountId: string): Promise<string | null> {
  const account = await user.get(accountId);
  if (account === null) return null;

  return account.profile === null ? null : `${account.profile.firstname} ${account.profile.lastname}`;
}

/** Everything a read answers with, for a screen that shows the lot. */
export async function summaryOf(
  accountId: string,
): Promise<Record<string, unknown> | null> {
  const account = await user.get(accountId);
  if (account === null) return null;

  return {
    email: account.email,
    verified: account.emailVerified,
    shutOut: account.banned !== null,
    avatar: account.profile?.avatar ?? null,
    theme: account.settings?.theme ?? null,
    balance: account.wallet?.balance ?? 0,
  };
}

/**
 * Changing a password, which ends every session and throws every device out.
 *
 * The current password is checked by signing in with it, since that is the only way to ask the
 * identity provider whether it is right. The session that mints is revoked either way.
 */
export async function changePassword(
  accountId: string,
  current: string,
  next: string,
  confirmation: string,
): Promise<string | null> {
  const changed = await user.password.update(
    accountId,
    current,
    next,
    confirmation,
  );
  if (changed.ok) return null;

  switch (changed.error) {
    case PasswordError.InvalidCurrentPassword:
      return "the current password is wrong";
    case PasswordError.SameAsCurrentPassword:
      return "pick a password you are not already using";
    case PasswordError.PasswordsDoNotMatch:
      return "the two copies are not the same";
    default:
      return "could not change the password";
  }
}

/** Moving to another address, which is not in force until the link sent there is followed. */
export async function changeEmail(
  accountId: string,
  email: string,
): Promise<string | null> {
  const asked = await user.identifier.email(accountId, email);
  if (asked.ok) return null;

  return asked.error === IdentifierError.Conflict ? "that address is taken" : "could not change the address";
}

/** Moving to another number, which sends a code there and waits for it to come back. */
export async function changePhone(
  accountId: string,
  phone: string,
): Promise<boolean> {
  const asked = await user.identifier.phone(accountId, phone);
  return asked.ok;
}

/** Putting the new number in force once the code comes back. */
export async function confirmPhone(
  accountId: string,
  phone: string,
  code: string,
): Promise<boolean> {
  const confirmed = await user.identifier.confirmPhone(accountId, phone, code);
  return confirmed.ok;
}
