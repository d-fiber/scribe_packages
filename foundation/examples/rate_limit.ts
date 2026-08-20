import { Time } from "@scribe/core/contracts/common/time.ts";
import {
  RateLimit,
  SHARED_ADDRESS_MAX_PENALTY,
  SHARED_ADDRESS_STRIKE_MEMORY,
} from "@scribe/foundation/src/rate_limit/mod.ts";

/**
 * A limit that guards a credential, so an unmeasured caller is refused.
 *
 * `limit` and `window` are a burst and a rate at the same time: ten hits may be spent at once,
 * and one comes back every six seconds. Nothing empties on a boundary, so there is no second
 * worth waiting for.
 */
export const signIn = new RateLimit({
  key: "sign-in:email",
  limit: 10,
  window: Time.minutes(1),
  penalty: Time.minutes(5),
  failOpen: false,
});

/**
 * A limit keyed on a network address, which punishes everyone behind it.
 *
 * An office, a campus and a mobile carrier all put thousands of people on one address, so the
 * penalty stops doubling early and the strikes are forgotten within the hour. Both values are
 * passed rather than applied by the class, because only the code that built the bucket knows
 * whether it named an account or an address.
 */
export const anonymousReads = new RateLimit({
  key: "reads",
  limit: 300,
  window: Time.minutes(1),
  penalty: Time.minutes(1),
  maxPenalty: SHARED_ADDRESS_MAX_PENALTY,
  strikeMemory: SHARED_ADDRESS_STRIKE_MEMORY,
});

/**
 * Records one hit and says how many seconds to wait when it is refused.
 *
 * The two segments are the caller's to build: the prefix is what the limit is mounted under,
 * such as the node the request came in on, and the suffix is who the hit is counted against.
 * A call that passes neither uses the one bucket everybody shares, which protects the thing
 * behind the endpoint rather than the callers of it.
 */
export async function retryAfterSignIn(node: string, accountId: string): Promise<number | null> {
  const outcome = await signIn.check(node, accountId);
  return outcome.ok ? null : outcome.retryAfter;
}

/**
 * Says whether a bucket is serving a penalty, without recording anything.
 *
 * It costs the caller no allowance, so it tells someone they are blocked without pushing
 * their release further away.
 */
export function isSignInBlocked(node: string, accountId: string): Promise<boolean> {
  return signIn.isBlocked(node, accountId);
}
