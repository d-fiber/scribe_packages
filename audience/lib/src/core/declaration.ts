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

import type { Duration } from "@scribe/alchemy";
import { Failure, Ok, okay, type Result } from "@scribe/alchemy";
import { AudienceError, type AudienceOptions, type JoinOptions } from "../../contracts/audience.ts";
import {
  dropAudience,
  dropMembership,
  hasExpired,
  type MembersPage,
  membershipOf,
  membersOf,
  reapExpired,
  retimeMembership,
  writeMembership,
  writeMemberships,
} from "../db/members.ts";
import type { AudienceRow } from "../db/tables.ts";
import { cachedMembership, forgetAudience, forgetMembership } from "../runtime/cache.ts";
import { guarded } from "./guard.ts";
import { audienceKey, audienceSegment, memberSegment } from "./key.ts";
import { declareAudience } from "./registry.ts";

/**
 * One audience, and the seven things a caller does with it.
 *
 * Nothing here learns what a member is. It holds the identifier the caller gave, which is what
 * lets an account, a device and a workspace live in the same table without the package having to
 * tell them apart.
 */
export interface Members {
  /** The key this audience answers to, scope included. */
  readonly name: string;

  /**
   * Whether `member` belongs to this audience.
   *
   * It never fails. A table that cannot be reached answers false, reported, and so does a
   * membership that has expired. A caller asking this is deciding whether to let something
   * through, so the answer that costs least when it is wrong is the one that closes the door.
   *
   * @throws {AudienceMemberError} When `member` is empty, too long, or carries a control
   * character. That is a mistake in what the caller sent, not something a backend outage
   * produces, so it is not swallowed the way a backend failure is.
   */
  has(member: string): Promise<boolean>;

  /** Puts `member` in, and moves the expiry when it was already in. */
  add(member: string, options?: JoinOptions): Promise<Result<void, AudienceError>>;

  /**
   * Puts every one of `members` in, in a handful of round trips rather than one per member.
   *
   * This is the call a caller building a large audience in one shot reaches for: adding twenty
   * thousand members one at a time each pays a read and a write, where this pays a few. An empty
   * list is a no-op that never reaches the table or the cache.
   */
  addMany(members: readonly string[], options?: JoinOptions): Promise<Result<void, AudienceError>>;

  /** Takes `member` out, and answers `NotFound` when it was not in. */
  remove(member: string): Promise<Result<void, AudienceError>>;

  /**
   * Moves when `member` is dropped, counting from now, without putting anybody in.
   *
   * Null makes the membership never expire. A member this audience does not hold answers
   * `NotFound`, since there is no row to move.
   */
  ttl(member: string, ttl: Duration | null): Promise<Result<void, AudienceError>>;

  /**
   * One page of this audience's members, live ones only.
   *
   * It never fails, and a table that cannot be reached answers an empty, non-truncated page. Pass
   * `after` the last cursor's value to read the next page; `truncated` tells the caller the scan
   * gave up before it could say the page was complete, which is the one thing a caller must check
   * before treating a short page as the whole audience.
   */
  members(options?: { after?: string; limit?: number }): Promise<MembersPage>;

  /**
   * Empties this audience, and answers whether the wipe went through.
   *
   * An audience that stops being used leaves its members behind otherwise, and they come back the
   * day the name is reused for something else.
   */
  clear(): Promise<Result<void, AudienceError>>;

  /**
   * Physically removes this audience's rows that have already expired, and answers how many.
   *
   * A membership that has expired already reads as absent, so this changes nothing a caller can
   * observe; it only stops the table from growing forever with rows nothing answers with any more.
   * Nothing calls this on its own — a project wires it into a cron of its own, one audience at a
   * time, which is what keeps a reap from touching more than the one audience it was asked about.
   */
  reap(): Promise<Result<number, AudienceError>>;
}

/**
 * A family of audiences, one per thing the project keys them on.
 *
 * It carries nothing a caller can ask directly, and that is the whole of what it buys: naming the
 * scope is the only way in, so a check meant for one project cannot read the members of another.
 */
export interface NamespacedAudience {
  /** The name every audience of this family is namespaced under. */
  readonly name: string;

  /**
   * The audience of `scope`, narrowed further by `nested` when the project nests them.
   *
   * @throws {AudienceKeyError} When a scope carries anything a key cannot hold.
   */
  in(scope: string, ...nested: string[]): Members;
}

/**
 * The two ways to declare an audience under one feature.
 *
 * @see {@link Audience.for}
 */
export interface AudienceFeature {
  /**
   * Declares the one audience named `name`, under this feature.
   *
   * @throws {TypeError} When another declaration already took `name` under this feature.
   * @throws {AudienceKeyError} When `name` carries anything a key cannot hold.
   */
  global(name: string, options?: AudienceOptions): Members;

  /**
   * Declares a family of audiences named `name`, under this feature, one per scope a caller keys
   * it on.
   *
   * @throws {TypeError} When another declaration already took `name` under this feature.
   * @throws {AudienceKeyError} When `name` carries anything a key cannot hold.
   */
  namespaced(name: string, options?: AudienceOptions): NamespacedAudience;
}

/**
 * One named set a project puts identifiers into, and asks about on the way in.
 *
 * ```ts
 * const chat = Audience.for("chat");
 * const banned = chat.global("banned");
 * const editors = chat.namespaced("project-editors");
 *
 * await banned.has(accountId);
 * await editors.in(projectId).add(accountId, { ttl: Duration.days(30) });
 * await editors.in(projectId).has(accountId);
 * ```
 *
 * `Audience.for(feature)` is the first thing every declaration names, and it is not optional:
 * `feature` is what the table is partitioned on, so a project that never says which feature an
 * audience belongs to is a project that cannot keep an unrelated feature's churn from degrading
 * this one. Two features may declare the same name; `feature` already keeps their rows, and their
 * cache entries, apart, so nothing else needs to.
 *
 * The two ways of declaring inside one feature answer two different questions. A global audience
 * is one set, so asking whether somebody is in it is a complete question. A namespaced audience is
 * a family, one set per project, per workspace or per whatever the project keys it on, and the
 * question means nothing until that key is named. That is why they hand back {@link Members} and
 * {@link NamespacedAudience}: the compiler refuses a check that forgot its scope.
 *
 * A declaration is **built, not extended**: the constructor is private and both factories hand
 * back an interface, so there is one way to make one and it names everything at once. It is safe
 * to keep at module scope, since it holds no client and no identity.
 *
 * Nothing here decides what belonging buys. This is a primitive: a route asks whether its caller
 * is in an audience and settles the rest itself, and a module that needs a right of its own names
 * the audience it reads instead of growing a second table.
 */
export class Audience implements Members, NamespacedAudience {
  /** The feature this declaration belongs to, and the value its table and cache entries are kept apart by. */
  readonly feature: string;

  /** The key this declaration was made under, and the set or family it reads and writes by. */
  readonly name: string;

  readonly #ttl: Duration | null;

  private constructor(feature: string, name: string, ttl: Duration | null) {
    this.feature = feature;
    this.name = name;
    this.#ttl = ttl;
  }

  /**
   * Names the feature every audience declared through the result belongs to.
   *
   * @throws {AudienceKeyError} When `feature` carries anything a key cannot hold.
   */
  static for(feature: string): AudienceFeature {
    const claimed = audienceSegment(feature);

    return {
      global: (name, options = {}) => new Audience(claimed, Audience.#declared(claimed, name), options.ttl ?? null),
      namespaced: (name, options = {}) =>
        new Audience(claimed, Audience.#declared(claimed, name), options.ttl ?? null),
    };
  }

  /** Registers `name` under `feature` in the declared-audience registry and answers the key it was declared under. */
  static #declared(feature: string, name: string): string {
    const key = audienceSegment(name);
    declareAudience(feature, key);
    return key;
  }

  /** The {@link NamespacedAudience.in} implementation: derives the scoped audience's key and reuses this declaration's `ttl`. */
  in(scope: string, ...nested: string[]): Members {
    return new Audience(this.feature, audienceKey(this.name, [scope, ...nested]), this.#ttl);
  }

  /**
   * The {@link Members.has} implementation: reads through the cache, and answers `false` rather
   * than throwing when the backend cannot be reached, since a closed door costs less than an open
   * one when the answer cannot be trusted.
   */
  async has(member: string): Promise<boolean> {
    memberSegment(member);

    try {
      return await this.#held(member) !== null;
    } catch {
      console.error(`[audience] ${this.feature}/${this.name} could not be read, so nobody belongs to it.`);
      return false;
    }
  }

  /**
   * The {@link Members.add} implementation: writes the membership, then evicts the cached
   * `has` result so a check right after `add` sees the change instead of a stale answer.
   */
  async add(member: string, options: JoinOptions = {}): Promise<Result<void, AudienceError>> {
    memberSegment(member);

    return await guarded(async () => {
      const written = await writeMembership({
        feature: this.feature,
        audience: this.name,
        member,
        expiresAt: this.#expiresAt(options),
      });

      await forgetMembership(this.name, member);
      return written ? okay : new Failure(AudienceError.Backend);
    });
  }

  /**
   * The {@link Members.addMany} implementation: writes every membership in a handful of chunked
   * upserts, then bumps this audience's cache generation once instead of evicting each member's
   * entry in turn.
   */
  async addMany(members: readonly string[], options: JoinOptions = {}): Promise<Result<void, AudienceError>> {
    for (const member of members) memberSegment(member);
    if (members.length === 0) return okay;

    return await guarded(async () => {
      const expiresAt = this.#expiresAt(options);
      const written = await writeMemberships(
        members.map((member) => ({ feature: this.feature, audience: this.name, member, expiresAt })),
      );

      if (!written) return new Failure(AudienceError.Backend);

      await forgetAudience(this.name);
      return okay;
    });
  }

  /** The {@link Members.remove} implementation: drops the membership, then evicts the cache the same way {@link add} does. */
  async remove(member: string): Promise<Result<void, AudienceError>> {
    memberSegment(member);

    return await guarded(async () => {
      const removed = await dropMembership(this.feature, this.name, member);

      await forgetMembership(this.name, member);
      return removed ? okay : new Failure(AudienceError.NotFound);
    });
  }

  /**
   * The {@link Members.ttl} implementation: re-times the stored membership without touching
   * whether `member` belongs, then evicts the cache the same way {@link add} does.
   */
  async ttl(member: string, ttl: Duration | null): Promise<Result<void, AudienceError>> {
    memberSegment(member);

    return await guarded(async () => {
      const retimed = await retimeMembership(
        this.feature,
        this.name,
        member,
        ttl === null ? null : Date.now() + ttl.inMilliseconds,
      );

      await forgetMembership(this.name, member);
      return retimed ? okay : new Failure(AudienceError.NotFound);
    });
  }

  /**
   * The {@link Members.members} implementation: lists the audience, and answers an empty,
   * non-truncated page rather than throwing when the backend cannot be reached.
   */
  async members(options: { after?: string; limit?: number } = {}): Promise<MembersPage> {
    try {
      return await membersOf(this.feature, this.name, options);
    } catch {
      console.error(`[audience] ${this.feature}/${this.name} could not be listed, so it reads as empty.`);
      return { members: [], cursor: null, truncated: false };
    }
  }

  /** The {@link Members.clear} implementation: drops the whole audience, then evicts its cache. */
  async clear(): Promise<Result<void, AudienceError>> {
    return await guarded(async () => {
      const wiped = await dropAudience(this.feature, this.name);

      await forgetAudience(this.name);
      return wiped ? okay : new Failure(AudienceError.Backend);
    });
  }

  /** The {@link Members.reap} implementation: physically removes this audience's expired rows. */
  reap(): Promise<Result<number, AudienceError>> {
    return guarded(async () => new Ok(await reapExpired(this.feature, this.name)));
  }

  /** What `options.ttl` resolves to: the caller's own, this declaration's when absent, forever for null. */
  #expiresAt(options: JoinOptions): number | null {
    const ttl = options.ttl !== undefined ? options.ttl : this.#ttl;
    return ttl === null ? null : Date.now() + ttl.inMilliseconds;
  }

  /** `member`'s row in this audience, read through the cache, or `null` when it is missing or has expired. */
  async #held(member: string): Promise<AudienceRow | null> {
    const row = await cachedMembership(
      this.name,
      member,
      () => membershipOf(this.feature, this.name, member),
    );

    return row === null || hasExpired(row) ? null : row;
  }
}
