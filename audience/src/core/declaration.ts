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

import type { Time } from "@scribe/core/contracts/common/time.ts";
import { Failure, OK, type Result } from "@scribe/core/contracts/result.ts";
import { AudienceError, type AudienceOptions, type JoinOptions } from "../../contracts/audience.ts";
import {
  dropAudience,
  dropMembership,
  hasExpired,
  membershipOf,
  membersOf,
  retimeMembership,
  writeMembership,
} from "../db/members.ts";
import type { AudienceRow } from "../db/tables.ts";
import { cachedMembership, forgetAudience, forgetMembership } from "../runtime/cache.ts";
import { guarded } from "./guard.ts";
import { audienceKey, audienceSegment } from "./key.ts";
import { declareAudience } from "./registry.ts";

/**
 * One audience, and the six things a caller does with it.
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
   */
  has(member: string): Promise<boolean>;

  /** Puts `member` in, and moves the expiry when it was already in. */
  add(member: string, options?: JoinOptions): Promise<Result<void, AudienceError>>;

  /** Takes `member` out, and answers `NotFound` when it was not in. */
  remove(member: string): Promise<Result<void, AudienceError>>;

  /**
   * Moves when `member` is dropped, counting from now, without putting anybody in.
   *
   * Null makes the membership never expire. A member this audience does not hold answers
   * `NotFound`, since there is no row to move.
   */
  ttl(member: string, ttl: Time | null): Promise<Result<void, AudienceError>>;

  /**
   * The members of this audience, up to the cap the package lists with.
   *
   * It never fails, and a table that cannot be reached answers with an empty listing, reported.
   * Reaching the cap is reported too, because a truncated listing is indistinguishable from a
   * complete one at the call site.
   */
  members(): Promise<string[]>;

  /**
   * Empties this audience, and answers whether the wipe went through.
   *
   * An audience that stops being used leaves its members behind otherwise, and they come back the
   * day the name is reused for something else.
   */
  clear(): Promise<Result<void, AudienceError>>;
}

/**
 * A family of audiences, one per thing the project scopes them by.
 *
 * It carries nothing a caller can ask directly, and that is the whole of what it buys: naming the
 * scope is the only way in, so a check meant for one project cannot read the members of another.
 */
export interface ScopedAudience {
  /** The name every audience of this family is keyed under. */
  readonly name: string;

  /**
   * The audience of `scope`, narrowed further by `nested` when the project nests them.
   *
   * @throws {AudienceKeyError} When a scope carries anything a key cannot hold.
   */
  in(scope: string, ...nested: string[]): Members;
}

/**
 * One named set a project puts identifiers into, and asks about on the way in.
 *
 * ```ts
 * const banned = Audience.global("banned");
 * const editors = Audience.scoped("project-editors");
 *
 * await banned.has(accountId);
 * await editors.in(projectId).add(accountId, { ttl: Time.days(30) });
 * await editors.in(projectId).has(accountId);
 * ```
 *
 * The two ways of declaring answer two different questions. A global audience is one set, so
 * asking whether somebody is in it is a complete question. A scoped audience is a family, one set
 * per project, per workspace or per whatever the project scopes it by, and the question means
 * nothing until the scope is named. That is why they hand back {@link Members} and
 * {@link ScopedAudience}: the compiler refuses a check that forgot its scope.
 *
 * A declaration is **built, not extended**: the constructor is private and both factories hand
 * back an interface, so there is one way to make one and it names everything at once. It is safe
 * to keep at module scope, since it holds no client and no identity.
 *
 * Nothing here decides what belonging buys. This is a primitive: a route asks whether its caller
 * is in an audience and settles the rest itself, and a module that needs a right of its own names
 * the audience it reads instead of growing a second table.
 */
export class Audience implements Members, ScopedAudience {
  readonly name: string;

  readonly #ttl: Time | null;

  private constructor(name: string, ttl: Time | null) {
    this.name = name;
    this.#ttl = ttl;
  }

  /**
   * Declares the one audience named `name`.
   *
   * @throws {TypeError} When another declaration already took `name`.
   * @throws {AudienceKeyError} When `name` carries anything a key cannot hold.
   */
  static global(name: string, options: AudienceOptions = {}): Members {
    return new Audience(Audience.#declared(name), options.ttl ?? null);
  }

  /**
   * Declares a family of audiences named `name`, one per scope a caller names.
   *
   * @throws {TypeError} When another declaration already took `name`.
   * @throws {AudienceKeyError} When `name` carries anything a key cannot hold.
   */
  static scoped(name: string, options: AudienceOptions = {}): ScopedAudience {
    return new Audience(Audience.#declared(name), options.ttl ?? null);
  }

  static #declared(name: string): string {
    const key = audienceSegment(name);
    declareAudience(key);
    return key;
  }

  in(scope: string, ...nested: string[]): Members {
    return new Audience(audienceKey(this.name, [scope, ...nested]), this.#ttl);
  }

  async has(member: string): Promise<boolean> {
    try {
      return await this.#held(member) !== null;
    } catch {
      console.error(`[audience] ${this.name} could not be read, so nobody belongs to it.`);
      return false;
    }
  }

  add(member: string, options: JoinOptions = {}): Promise<Result<void, AudienceError>> {
    return guarded(async () => {
      const ttl = options.ttl !== undefined ? options.ttl : this.#ttl;
      const written = await writeMembership(
        this.name,
        member,
        ttl === null ? null : Date.now() + ttl.ms,
      );

      await forgetMembership(this.name, member);
      return written ? new OK() : new Failure(AudienceError.Backend);
    });
  }

  remove(member: string): Promise<Result<void, AudienceError>> {
    return guarded(async () => {
      const removed = await dropMembership(this.name, member);

      await forgetMembership(this.name, member);
      return removed ? new OK() : new Failure(AudienceError.NotFound);
    });
  }

  ttl(member: string, ttl: Time | null): Promise<Result<void, AudienceError>> {
    return guarded(async () => {
      const retimed = await retimeMembership(
        this.name,
        member,
        ttl === null ? null : Date.now() + ttl.ms,
      );

      await forgetMembership(this.name, member);
      return retimed ? new OK() : new Failure(AudienceError.NotFound);
    });
  }

  async members(): Promise<string[]> {
    try {
      return await membersOf(this.name);
    } catch {
      console.error(`[audience] ${this.name} could not be listed, so it reads as empty.`);
      return [];
    }
  }

  clear(): Promise<Result<void, AudienceError>> {
    return guarded(async () => {
      const wiped = await dropAudience(this.name);

      await forgetAudience(this.name);
      return wiped ? new OK() : new Failure(AudienceError.Backend);
    });
  }

  async #held(member: string): Promise<AudienceRow | null> {
    const row = await cachedMembership(
      this.name,
      member,
      () => membershipOf(this.name, member),
    );

    return row === null || hasExpired(row) ? null : row;
  }
}
