import { Caller, Middleware, type RateLimiter, Time } from "@scribe/sdk";

/** Declares who may reach this node, which the gateway also gates behind a key. */
export class GuardedAccess extends Middleware {
  protected override access(): Caller {
    return Caller.Anonymous;
  }

  /** What one caller may spend here, on top of the quota the gateway already counts. */
  protected override rateLimit(): RateLimiter {
    return {
      limit: 60,
      window: Time.minutes(1),
      penalty: Time.minutes(1),
      maxPenalty: Time.minutes(5),
    };
  }
}
