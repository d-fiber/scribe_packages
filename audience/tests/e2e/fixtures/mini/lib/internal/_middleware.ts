import { Caller, Middleware, type RateLimiter, Time } from "@scribe/sdk";

/** Declares this node reachable by the engine alone, never from the gateway. */
export class InternalAccess extends Middleware {
  protected override access(): Caller {
    return Caller.Service;
  }

  /** A ceiling the engine is not expected to reach, kept so the route declares one. */
  protected override rateLimit(): RateLimiter {
    return {
      limit: 600,
      window: Time.minutes(1),
      penalty: Time.seconds(10),
      maxPenalty: Time.minutes(1),
    };
  }
}
