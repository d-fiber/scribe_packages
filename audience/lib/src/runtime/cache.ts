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

import { cache, DateTime, Duration } from "@scribe/alchemy";
import type { Future } from "@scribe/alchemy";
import type { AudienceRow } from "../db/tables.ts";

/**
 * How long a membership is kept, held or not.
 *
 * It is short by the standards of this cache because what it holds decides whether a caller gets
 * through. What the ten minutes cover is the row that expires on its own, which no write goes
 * through to announce.
 */
const CACHE_TTL = Duration.minutes(10);

/**
 * How long a generation is kept before it is recomputed from scratch.
 *
 * It only bounds how long a stale generation number could theoretically linger if it were never
 * read; every `clear()` writes a fresh one immediately; a long ttl costs nothing extra because a
 * missing entry already reads as generation zero.
 */
const GENERATION_TTL = Duration.days(1);

/**
 * How long a generation read locally is trusted before this process asks the cache again.
 *
 * `has()` is the hot path this whole file exists to keep cheap, and a generation-tagged key needs
 * the generation before it can even be looked up, which would otherwise cost every point check a
 * second round trip on top of the one it already pays for the membership itself. Two seconds is
 * how long a `clear()` on one replica can take to be seen as a fresh generation by another, and it
 * is a window this process names rather than one the cache hides inside a single method call.
 */
const LOCAL_GENERATION_TTL = Duration.seconds(2);

/**
 * What one cached membership holds.
 *
 * The row is wrapped rather than cached on its own so that the absence of a membership is cached
 * too. Most questions this package answers are asked about somebody who does not belong, and an
 * unwrapped null would send every one of them to Postgres.
 */
interface CachedMembership {
  /** The row in the table, null when the table holds none for that pair. */
  readonly row: AudienceRow | null;
}

const SEPARATOR = "|";

const members = cache<CachedMembership>({ key: "audience:member", ttl: CACHE_TTL });
const generations = cache<number>({ key: "audience:generation", ttl: GENERATION_TTL });

/**
 * The generation of a handful of audiences, read once from the cache and trusted for a short
 * while before this process asks again.
 *
 * @remarks
 * Named and kept here, rather than folded into a single method that hides the extra round trip, on
 * purpose: a cache port that computed this for free would be a fake teaching the wrong lesson, one
 * a real Redis adapter could not actually deliver on.
 */
class LocalGenerationCache {
  readonly #ttl: Duration;
  readonly #entries = new Map<string, { readonly value: number; readonly at: number }>();

  constructor(ttl: Duration) {
    this.#ttl = ttl;
  }

  /** The generation held for `audience`, or undefined when nothing fresh enough is held. */
  get(audience: string): number | undefined {
    const entry = this.#entries.get(audience);
    if (entry === undefined || DateTime.now().millisecondsSinceEpoch - entry.at >= this.#ttl.inMilliseconds) {
      return undefined;
    }
    return entry.value;
  }

  /** Remembers `value` as the generation of `audience`, fresh as of now. */
  set(audience: string, value: number): void {
    this.#entries.set(audience, { value, at: DateTime.now().millisecondsSinceEpoch });
  }
}

const localGenerations = new LocalGenerationCache(LOCAL_GENERATION_TTL);

/** The generation `audience` is at, trusting a fresh local read before asking the shared cache. */
async function currentGeneration(audience: string): Future<number> {
  const local = localGenerations.get(audience);
  if (local !== undefined) return local;

  const value = (await generations.get(audience)) ?? 0;
  localGenerations.set(audience, value);
  return value;
}

/** The generation of each of `audiences`, in the same order, without a local read in front. */
async function currentGenerations(audiences: readonly string[]): Future<number[]> {
  const values = await generations.getMany(audiences);
  return values.map((value) => value ?? 0);
}

function entryOf(audience: string, generation: number, member: string): string {
  return `${audience}${SEPARATOR}${generation}${SEPARATOR}${member}`;
}

/**
 * The row held for `member` in `audience`, loading it through `load` when the cache does not.
 *
 * What comes back is the row as the table holds it, expiry included and not applied: the moment a
 * membership stops counting is judged by the caller, after this, so it is exact instead of being
 * rounded up to whatever is left of the cache entry.
 */
export async function cachedMembership(
  audience: string,
  member: string,
  load: () => Future<AudienceRow | null>,
): Future<AudienceRow | null> {
  const generation = await currentGeneration(audience);
  const held = await members.upsert(
    entryOf(audience, generation, member),
    async () => ({ row: await load() }),
  );
  return held.row;
}

/** Drops what the cache holds for `member` in `audience`, so the next read goes to the table. */
export async function forgetMembership(audience: string, member: string): Future<void> {
  const generation = await currentGeneration(audience);
  await members.delete(entryOf(audience, generation, member));
}

/**
 * Drops what the cache holds for `member` in each of `audiences`.
 *
 * The audiences are named rather than swept because a sweep matching a member would have to walk
 * the whole keyspace of every audience this package has ever cached, and cost the same whatever
 * the size of the audiences actually named.
 */
export async function forgetMemberIn(audiences: readonly string[], member: string): Future<void> {
  if (audiences.length === 0) return;

  const generationOf = await currentGenerations(audiences);
  await members.deleteMany(...audiences.map((audience, at) => entryOf(audience, generationOf[at], member)));
}

/**
 * Retires every cache entry `audience` holds, without touching one of them.
 *
 * @remarks
 * This is what replaces a pattern-matched sweep of the whole keyspace: bumping the generation
 * makes every entry written under the old one unreachable, and they age out of the store on their
 * own ttl instead of being walked and deleted. The cost of clearing a hundred-thousand-member
 * audience is therefore the same as clearing a ten-member one, which a keyspace sweep can never be.
 *
 * The next generation is at least the previous one plus one, never just the clock: two calls
 * close enough together to read the same millisecond must still produce two different
 * generations, or the second clear would leave the first one's entries reachable.
 */
export async function forgetAudience(audience: string): Future<void> {
  const next = Math.max(DateTime.now().millisecondsSinceEpoch, await currentGeneration(audience) + 1);
  await generations.add(audience, next);
  localGenerations.set(audience, next);
}
