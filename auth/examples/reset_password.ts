import { ResetPasswordError } from "@scribe/auth/reset_password";
import { user } from "./declaration.ts";

/**
 * Asking for a reset by mail, which never says whether the address is in use.
 *
 * A route that answered differently for a known and an unknown address would be a way of asking
 * the framework who has an account, so the same answer goes back either way.
 */
export async function askByEmail(email: string): Promise<boolean> {
  const asked = await user.resetPassword.email(email);
  return asked.ok || asked.error === ResetPasswordError.TooManyRequests;
}

/** Asking by text message, which ends in a code rather than a link. */
export async function askByPhone(phone: string): Promise<boolean> {
  const asked = await user.resetPassword.phone(phone);
  return asked.ok;
}

/**
 * Turning the code into the token that buys one password change.
 *
 * The token is what proves the holder is there, so it is minted here and spent by `finish`.
 */
export async function confirmCode(phone: string, code: string): Promise<string | null> {
  const confirmed = await user.resetPassword.confirmPhone(phone, code);
  return confirmed.ok ? confirmed.data.pendingToken : null;
}

/**
 * Turning the recovery session a link opened into the same token.
 *
 * The recovery session is revoked on the way: it was minted only to prove the link was followed,
 * and leaving it alive would let it be used as an ordinary session.
 */
export async function fromLink(accountId: string, recoveryToken: string): Promise<string | null> {
  const issued = await user.resetPassword.fromRecovery(accountId, recoveryToken);
  return issued.ok ? issued.data.pendingToken : null;
}

/** Spending the token and writing the password, which ends every session of the account. */
export async function finish(pendingToken: string, next: string, confirmation: string): Promise<string | null> {
  const written = await user.resetPassword.complete(pendingToken, next, confirmation);
  if (written.ok) return null;

  switch (written.error) {
    case ResetPasswordError.PasswordsDoNotMatch:
      return "the two passwords are not the same";
    case ResetPasswordError.InvalidPassword:
      return "pick a longer password";
    case ResetPasswordError.InvalidOrExpiredToken:
      return "ask for a new link";
    default:
      return "could not set the password";
  }
}
