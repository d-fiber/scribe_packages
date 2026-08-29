import { Caller, Middleware, type RateLimiter, Time } from "@scribe/sdk";

/**
 * Wraps every route under this node.
 *
 * A middleware here holds for the whole node. One placed in a folder holds for
 * that folder, and the closest to the route wins.
 */
export class ExampleBrowsing extends Middleware {
  protected override access(): Caller {
    return Caller.Anonymous;
  }

  /**
   * What one caller may spend on this node.
   *
   * The counter is kept per caller, and a caller is the signed-in account when
   * the request carries an identity and the address it came from when it does
   * not. A request that is neither is not counted at all. The key is prefixed
   * with the node, so what is spent here is not spent anywhere else.
   *
   * Going over does not answer 429 and forget: the caller is held out for
   * `penalty`, and holding out again lengthens it up to `maxPenalty`. That is
   * what makes a script back off instead of retrying at the same pace.
   *
   * An address is shared, by an office or by a carrier's NAT, so the framework
   * shortens `maxPenalty` on its own when the caller is one: punishing an
   * address for a quarter of an hour punishes whoever else is behind it.
   */
  protected override rateLimit(): RateLimiter {
    return {
      limit: 120,
      window: Time.minutes(5),
      penalty: Time.minutes(1),
      maxPenalty: Time.minutes(15),
    };
  }
}
