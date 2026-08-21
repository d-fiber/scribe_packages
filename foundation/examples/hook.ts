import { Failure, OK, type Result } from "@scribe/core/contracts/result.ts";
import { Hook } from "@scribe/foundation/lib/src/hook/mod.ts";

/** What a sign-up carries to whoever listens for it. */
interface SignUp {
  /** The account that was just created. */
  readonly accountId: string;

  /** The mailbox it was created with. */
  readonly email: string;
}

/** Why a sign-up was turned down by a subscriber. */
type SignUpRefusal = "blocked_domain";

/**
 * An extension point whose subscribers are side effects, so it decides nothing.
 *
 * There is no fallback because there is no answer to give: a hook nobody listens to has run
 * to completion.
 */
export const signedIn = new Hook<{ accountId: string }>({ name: "auth.signed-in" });

/**
 * An extension point that carries a decision, so it says what it answers when nobody listens.
 *
 * The fallback is required as soon as there is a decision, which keeps the answer of an
 * unwired project written down rather than inferred.
 */
export const signingUp = new Hook<SignUp, Result<void, SignUpRefusal>>({
  name: "auth.signing-up",
  fallback: new OK(),
});

/**
 * A subscriber that runs inside the request, in order, and may refuse.
 *
 * It is endpoint code written elsewhere: same latency, same transaction, same consequence.
 * Answering something whose `ok` is false stops the chain, and the emitter sees that answer.
 */
export const refuseBlockedDomains = signingUp.on((payload: SignUp) => {
  return payload.email.endsWith("@blocked.example") ? new Failure<SignUpRefusal>("blocked_domain") : new OK();
});

/**
 * A subscriber that runs later and survives a crash, and cannot refuse.
 *
 * There is no request context on the other side, so everything the body needs travels in the
 * payload. A database write in particular gets no owner filter applied, which is why an
 * account identifier is in nearly every payload.
 */
export const sendWelcome = signingUp.background(async (payload: SignUp) => {
  await mail(payload.email);
});

/**
 * Emits the event and answers what the inline chain decided.
 *
 * The background subscribers are queued only when nobody refused, so a sign-up that was turned
 * down sends no welcome mail.
 */
export function announceSignUp(payload: SignUp): Promise<Result<void, SignUpRefusal>> {
  return signingUp.run(payload);
}

function mail(_to: string): Promise<void> {
  return Promise.resolve();
}
