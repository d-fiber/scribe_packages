// Copyright (C) 2026 Fiber
//
// This file is part of scribe and is made available under the PolyForm Shield
// License 1.0.0. The full terms are in the LICENSE file at the root of this
// repository, and at https://polyformproject.org/licenses/shield/1.0.0
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
//
// The one thing you may not do:
// - Use it to provide any product that competes with scribe, or with any
//   product Fiber or its affiliates provide using scribe. Products compete
//   even when they are offered free of charge, through a different kind of
//   interface, or for a different technical platform.
//
// If you pass this software on:
// - Anyone who receives any part of it from you must also receive these terms,
//   or the URL above, together with the "Required Notice" line carried by the
//   LICENSE file.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE COMES AS IS, WITHOUT ANY WARRANTY OR
// CONDITION, AND THE LICENSOR WILL NOT BE LIABLE TO YOU FOR ANY DAMAGES ARISING
// OUT OF THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY KIND OF
// LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

import { kv } from "@scribe/foundation/src/redis/mod.ts";

/** The Redis client, once the rate limit script has been registered on it. */
export interface RateLimitCommands {
  /**
   * Records one hit against a bucket and says what became of it.
   *
   * Answers four numbers: one when the hit is allowed and zero when it is refused, then how many
   * hits are left in the burst, then how many seconds to wait, then how many penalties this
   * bucket has earned. The last two are zero on an allowed hit and the second is zero on a
   * refused one.
   */
  rateLimitCheck(
    blockedKey: string,
    arrivalKey: string,
    strikesKey: string,
    limit: number,
    window: number,
    penalty: number,
    maxPenalty: number,
    strikeMemory: number,
  ): Promise<[number, number, number, number]>;
}

/**
 * The Lua that shapes the traffic and writes the penalty, in one step.
 *
 * @remarks
 * The shaping is the Generic Cell Rate Algorithm, the leaky bucket of ATM networks. The whole
 * state of a bucket under its limit is one timestamp, the theoretical arrival time, which is the
 * moment the bucket would be empty if every hit so far had arrived exactly on schedule. A hit is
 * allowed when that moment is no further ahead than one burst, and it pushes the moment forward
 * by one emission interval.
 *
 * It replaces a sorted set of every hit inside the window. That set was the thing that grew under
 * the attack it existed to stop, since a flood wrote one member per hit before any of them was
 * refused. A timestamp costs the same whatever the traffic.
 *
 * It also refills continuously instead of all at once. A window that empties on the second gives
 * a refused caller a reason to come back at exactly that second, and a fleet of them arrives
 * together; here one slot comes back every `window / limit`.
 *
 * The clock is Redis's own, through `TIME`, not the caller's. Two hosts of a fleet whose clocks
 * differ by a second would otherwise disagree on where the window starts, and the faster one
 * would grant an allowance the slower one had already spent. Valkey and Redis 7 replicate script
 * effects rather than the script, so reading the clock and writing in the same script is allowed.
 */
const RATE_LIMIT_SCRIPT = `
local blocked_key = KEYS[1]
local arrival_key = KEYS[2]
local strikes_key = KEYS[3]

local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local penalty = tonumber(ARGV[3])
local max_penalty = tonumber(ARGV[4])
local strike_memory = tonumber(ARGV[5])

local function seconds(value)
  return math.max(1, math.floor(value))
end

local clock = redis.call('TIME')
local now = tonumber(clock[1]) + tonumber(clock[2]) / 1000000

local blocked = redis.call('PTTL', blocked_key)
if blocked > 0 then
  local held = tonumber(redis.call('GET', strikes_key)) or 0
  return {0, 0, math.ceil(blocked / 1000), held}
end

local emission = window / limit
local arrival = tonumber(redis.call('GET', arrival_key)) or now
local next_arrival = math.max(arrival, now) + emission
local allow_at = next_arrival - window

if now < allow_at then
  local strikes = redis.call('INCR', strikes_key)
  redis.call('EXPIRE', strikes_key, seconds(strike_memory))
  local scaled = seconds(math.min(penalty * (2 ^ (strikes - 1)), max_penalty))
  redis.call('SET', blocked_key, '1', 'EX', scaled)
  redis.call('DEL', arrival_key)
  return {0, 0, scaled, strikes}
end

redis.call('SET', arrival_key, next_arrival, 'EX', seconds(next_arrival - now) + 1)
return {1, math.floor((now - allow_at) / emission + 0.5), 0, 0}
`;

/**
 * The Redis client with `rateLimitCheck` available on it.
 *
 * Registration happens on first use rather than at import, and only when the command is missing.
 * The guard is not defensive: tests install their fakes before anything calls this, and
 * registering unconditionally would overwrite the stub they just put in place.
 */
export function rateLimitCommands(): RateLimitCommands {
  const client = kv();
  const commands = client as unknown as Partial<RateLimitCommands>;

  if (typeof commands.rateLimitCheck !== "function") {
    client.defineCommand("rateLimitCheck", {
      numberOfKeys: 3,
      lua: RATE_LIMIT_SCRIPT,
    });
  }

  return client as unknown as RateLimitCommands;
}
