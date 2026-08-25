import { SignInRefusal } from "@scribe/auth/declaration";
import { OtpError, SignInError } from "@scribe/auth/sign_in";
import { user, UserRefusal } from "./declaration.ts";

/** What a route hands back once a sign-in has been decided. */
export type SignInOutcome =
  | { readonly kind: "session"; readonly accessToken: string }
  | { readonly kind: "challenge"; readonly pendingToken: string }
  | { readonly kind: "refused"; readonly reason: string };

/**
 * Signing in with an address, which does not always end in a session.
 *
 * A device the account has never used is sent a code instead, and the pending token that comes
 * back is what the caller returns with. The two answers are told apart by what the result holds,
 * so a route cannot forget the second case.
 */
export async function withEmail(email: string, password: string): Promise<SignInOutcome> {
  const answer = await user.signIn.email({ email, password });

  if (!answer.ok) return { kind: "refused", reason: reasonOf(answer.error) };
  if ("pendingToken" in answer.data) {
    return { kind: "challenge", pendingToken: answer.data.pendingToken };
  }

  return { kind: "session", accessToken: answer.data.access_token };
}

/** Ending the challenge, which is where a new device earns its session and its token. */
export async function withCode(pendingToken: string, code: string): Promise<SignInOutcome> {
  const answer = await user.signIn.email.verify(pendingToken, code);

  if (!answer.ok) {
    return {
      kind: "refused",
      reason: answer.error === OtpError.TooManyRequests ? "too many attempts" : "wrong or expired code",
    };
  }

  return { kind: "session", accessToken: answer.data.access_token };
}

/** Sending another code, which replaces the pending token rather than keeping it alive. */
export async function resend(pendingToken: string): Promise<string | null> {
  const answer = await user.signIn.email.resend(pendingToken);
  return answer.ok ? answer.data.pendingToken : null;
}

/** An identity another provider vouched for never sends a code, so it has no exchange to offer. */
export async function withGoogle(idToken: string, nonce: string): Promise<SignInOutcome> {
  const answer = await user.signIn.google({ idToken, nonce });

  if (!answer.ok) return { kind: "refused", reason: reasonOf(answer.error) };
  if ("pendingToken" in answer.data) return { kind: "refused", reason: "unreachable" };

  return { kind: "session", accessToken: answer.data.access_token };
}

/**
 * What a caller is told, the project's own refusals included.
 *
 * The declaration's `signIn` condition answers with this project's enum, and its members land in
 * the same union as the engine's, so nothing has to be caught apart.
 */
function reasonOf(error: SignInError | SignInRefusal | UserRefusal): string {
  switch (error) {
    case SignInRefusal.Banned:
      return "this account is shut out";
    case UserRefusal.OnboardingRequired:
      return "finish setting up the account first";
    case UserRefusal.RegionUnavailable:
      return "not available where you are calling from";
    case SignInError.EmailNotConfirmed:
      return "confirm the address first, we sent another link";
    case SignInError.TooManyRequests:
      return "too many attempts, come back later";
    default:
      return "wrong address or password";
  }
}
