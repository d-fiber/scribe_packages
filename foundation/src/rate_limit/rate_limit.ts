// Copyright (C) 2026 Fiber
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0. If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
// - Combine it with files under any other licence, proprietary ones included,
//   and licence that larger work on your own terms.
//
// What you must do in return:
// - Keep this notice on every file you received it on.
// - Publish, under these same terms, the source of every file covered by them
//   that you distribute, including the ones you changed, so that whoever
//   receives your version can obtain that source.
// - Leave Fiber out of it: the name "Fiber", its branding, its logos and its
//   trademarks may not be used to endorse or promote what you build, and this
//   licence grants no right to them.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
// OR CONDITION OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
// NON-INFRINGEMENT. IN NO EVENT SHALL FIBER BE LIABLE FOR ANY DIRECT, INDIRECT,
// INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING BUT NOT
// LIMITED TO LOSS OF USE, DATA, PROFITS, OR BUSINESS INTERRUPTION) ARISING OUT
// OF OR RELATED TO THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY
// KIND OF LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

import { Time } from "@scribe/core/contracts/common/time.ts";
import { kv } from "@scribe/foundation/src/redis/mod.ts";
import { RateLimitBucket } from "./bucket.ts";
import { rateLimitCommands } from "./script.ts";

/**
 * What declaring a rate limit takes.
 *
 * The first four are the policy and have no sensible default: how many hits, over how long, and
 * how long a caller waits once it goes over. The rest answer right far more often than they are
 * wrong.
 */
export interface RateLimitOptions {
  /** The name every bucket of this limit carries in the middle of its key. */
  readonly key: string;

  /**
   * How many hits are allowed at once, and how many come back over one window.
   *
   * It is a burst and a rate at the same time: a caller may spend all of it in one go, and from
   * then on gets one hit back every `window / limit`. Nothing empties on a boundary, so there is
   * no second worth waiting for.
   */
  readonly limit: number;

  /** How long the whole allowance takes to come back. */
  readonly window: Time;

  /** How long the first penalty lasts, before any doubling. */
  readonly penalty: Time;

  /**
   * The ceiling the doubling stops at.
   *
   * Left out, it is {@link DEFAULT_MAX_PENALTY}. A limit whose suffix is an address rather than an
   * account wants {@link SHARED_ADDRESS_MAX_PENALTY} instead, and says so.
   */
  readonly maxPenalty?: Time;

  /**
   * How long a penalty counts against the next one.
   *
   * Left out, it is {@link DEFAULT_STRIKE_MEMORY}. Shorten it where a caller is expected to hit
   * the limit in normal use, so that a bad afternoon does not decide the next morning.
   */
  readonly strikeMemory?: Time;

  /**
   * Whether a caller is let through when Redis cannot answer.
   *
   * Left out, it is true, which is the answer for a limit that protects capacity: an outage of
   * the limiter should not become an outage of the endpoint. Set it to false on anything that
   * guards a credential, where letting an unmeasured caller through is the worse of the two
   * failures.
   */
  readonly failOpen?: boolean;
}

/**
 * What came of one hit.
 *
 * @remarks
 * The two sides carry different numbers on purpose: an allowed caller wants to know how much it
 * has left, and a refused one wants to know when to come back. Nothing carries both, because
 * neither is meaningful on the other side.
 */
export type RateLimitOutcome =
  | {
    /** The hit was recorded and the caller is inside its allowance. */
    readonly ok: true;

    /** How many hits are left in the burst before the next one is refused. */
    readonly remaining: number;
  }
  | {
    /** The hit was refused, either now or by a penalty still running. */
    readonly ok: false;

    /** How many seconds before the penalty is over. */
    readonly retryAfter: number;

    /** How many penalties this bucket has earned inside its strike memory. */
    readonly strikes: number;
  };

/** The ceiling a penalty stops doubling at when a declaration does not say. */
export const DEFAULT_MAX_PENALTY: Time = Time.days(1);

/** How long a strike counts against the next penalty when a declaration does not say. */
export const DEFAULT_STRIKE_MEMORY: Time = Time.hours(24);

/**
 * The longest penalty a limit keyed on a network address should ever reach.
 *
 * A university, an office and a mobile carrier all put thousands of people behind one address, so
 * a bucket keyed on it punishes everyone for what one caller did. Fifteen minutes is long enough
 * to stop a script and short enough that a shared connection recovers on its own.
 *
 * It is a value to pass, not a rule this class applies: only the code that built the suffix knows
 * whether it named an account or an address.
 */
export const SHARED_ADDRESS_MAX_PENALTY: Time = Time.minutes(15);

/**
 * How long a limit keyed on a network address should remember its strikes.
 *
 * Kept short for the same reason as {@link SHARED_ADDRESS_MAX_PENALTY}: a strike count that
 * survives a day would make the second visitor of the day pay for the first.
 */
export const SHARED_ADDRESS_STRIKE_MEMORY: Time = Time.hours(1);

/**
 * One rate limit, declared once and asked at every call.
 *
 * ```ts
 * const signIn = new RateLimit({
 *   key: "sign-in:email",
 *   limit: 10,
 *   window: Time.minutes(1),
 *   penalty: Time.minutes(5),
 *   failOpen: false,
 * });
 *
 * const rate = await signIn.check(node, accountId);
 * if (!rate.ok) return tooManyRequests(rate.retryAfter);
 * ```
 *
 * The policy lives on the declaration and the bucket travels with the call, the way a cache
 * namespace is declared once and read by id. A limit whose numbers were passed at every call
 * would have as many policies as it has call sites, and the day one of them is raised the others
 * go on refusing without anyone noticing.
 *
 * **It never asks who is calling.** The two segments are the caller's to build, and a limit that
 * gets neither is one bucket shared by everybody, which is what protects the thing behind the
 * endpoint rather than the callers of it. Resolving an identity here would tie the package to the
 * request scope and would decide, for every call site at once, a question only the call site can
 * answer.
 *
 * Nothing here throws. An unreachable Redis is reported and answered according to `failOpen`, so
 * a limiter outage degrades into a decision the declaration already made.
 */
export class RateLimit {
  /** The name every bucket of this limit carries in the middle of its key. */
  readonly key: string;

  /** How many hits are allowed at once, and how many come back over one window. */
  readonly limit: number;

  /** How long the whole allowance takes to come back. */
  readonly window: Time;

  /** How long the first penalty lasts, before any doubling. */
  readonly penalty: Time;

  /**
   * Whether a caller is let through when this limit cannot be measured.
   *
   * It is public because the decision belongs to the declaration and outlives this class: code
   * that fails to build a bucket at all, because there is nobody to name, has to answer the same
   * question and must answer it the same way. See {@link unmeasured}.
   */
  readonly failOpen: boolean;

  readonly #maxPenalty: Time;
  readonly #strikeMemory: Time;

  constructor(options: RateLimitOptions) {
    this.key = options.key;
    this.limit = options.limit;
    this.window = options.window;
    this.penalty = options.penalty;
    this.failOpen = options.failOpen ?? true;
    this.#maxPenalty = options.maxPenalty ?? DEFAULT_MAX_PENALTY;
    this.#strikeMemory = options.strikeMemory ?? DEFAULT_STRIKE_MEMORY;
  }

  /**
   * Records one hit against the bucket `prefix` and `suffix` name, and says whether it is allowed.
   *
   * The key is the three segments joined, empty ones dropped, so the same declaration serves a
   * whole family of buckets. `prefix` is what the limit is mounted under, such as the node a
   * request came in on; `suffix` is who or what the hit is counted against, such as an account id
   * or the hash of a targeted mailbox. Neither is required, and a call that passes neither uses
   * the one bucket everybody shares.
   *
   * A refused hit is not counted twice. Once a penalty is running every call is refused by the
   * block itself, so a caller that keeps trying does not push its own release further away.
   */
  async check(prefix: string = "", suffix: string = ""): Promise<RateLimitOutcome> {
    if (!this.#usable()) return this.#allow();

    const bucket = new RateLimitBucket(prefix, this.key, suffix);

    try {
      const [allowed, remaining, retryAfter, strikes] = await rateLimitCommands().rateLimitCheck(
        bucket.blockedKey,
        bucket.arrivalKey,
        bucket.strikesKey,
        this.limit,
        this.window.value,
        this.penalty.value,
        this.#maxPenalty.value,
        this.#strikeMemory.value,
      );

      return allowed === 1 ? { ok: true, remaining } : { ok: false, retryAfter, strikes };
    } catch (error) {
      console.error(`[rate-limit] check of "${this.key}" failed, ${this.#onOutage()}:`, error);
      return this.unmeasured();
    }
  }

  /**
   * Whether the bucket `prefix` and `suffix` name is serving a penalty right now.
   *
   * It records nothing, so it costs a caller no allowance. Use it to tell someone they are blocked
   * without making the block last longer, and {@link check} everywhere the hit itself has to
   * count.
   */
  async isBlocked(prefix: string = "", suffix: string = ""): Promise<boolean> {
    try {
      const remaining = await kv().pttl(new RateLimitBucket(prefix, this.key, suffix).blockedKey);
      return remaining > 0;
    } catch (error) {
      console.error(`[rate-limit] read of "${this.key}" failed, ${this.#onOutage()}:`, error);
      return !this.failOpen;
    }
  }

  /**
   * What this limit answers for a hit it could not measure.
   *
   * Redis being unreachable is one way to get here. The other is a caller that had no bucket to
   * name, which happens outside a request, and that one is decided by the code building the
   * suffix rather than by this class.
   */
  unmeasured(): RateLimitOutcome {
    return this.failOpen ? this.#allow() : { ok: false, retryAfter: Math.ceil(this.window.value), strikes: 0 };
  }

  #usable(): boolean {
    if (this.limit > 0 && this.window.value > 0 && this.penalty.value > 0) return true;

    console.error(
      `[rate-limit] "${this.key}" declares limit=${this.limit} window=${this.window.value}s ` +
        `penalty=${this.penalty.value}s, which measures nothing, so nothing is refused`,
    );
    return false;
  }

  #allow(): RateLimitOutcome {
    return { ok: true, remaining: this.limit };
  }

  #onOutage(): string {
    return this.failOpen ? "letting the caller through" : "refusing the caller";
  }
}
