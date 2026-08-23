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

import { SignOutScope } from "@scribe/auth/contracts/account.ts";
import { Duration } from "@scribe/alchemy";
import { Failure, Ok, okay, type Result } from "@scribe/alchemy";
import { requestDevice } from "@scribe/core/runtime/device/device.ts";
import { currentIdentity } from "@scribe/core/runtime/http/accessors/identity.ts";
import { currentLocation } from "@scribe/core/runtime/http/accessors/location.ts";
import { checkCaller } from "@scribe/core/runtime/http/caller.ts";
import { request } from "@scribe/core/runtime/http/request.ts";
import { sha256Hex } from "@scribe/core/runtime/support/crypto/hash.ts";
import { KeyIndex } from "@scribe/core/runtime/redis/key_index.ts";
import { rateLimit } from "@scribe/alchemy";
import { Valkery } from "@scribe/foundation/lib/src/valkery/valkery.ts";
import type { AccountRole } from "../contracts/role.ts";
import { standingBanOn } from "./bans.ts";
import { DeviceCheck, devices } from "./devices/devices.ts";
import { goTrue } from "./gotrue/gotrue_client.ts";
import { AuthMapper } from "./gotrue/mappers.ts";
import { AccountRevocation } from "./revocation.ts";

const IDEMPOTENCE_TTL = Duration.seconds(15);
const INDEX_KEY = "session:idem:index";
const REFRESH_ENTRY = "refresh:";
const RECOVER_ENTRY = "recover:";

/**
 * What a refresh and a recovery already answered, so a client that asks twice gets one session.
 *
 * A client that retries on a slow answer would otherwise be handed a second session while the
 * first one is still in flight, and the identity provider would have rotated the refresh token
 * under it. Fifteen seconds is the window a retry lands in.
 */
class SessionIdempotence {
  readonly #refresh = new Valkery<unknown>({
    key: "refresh-idem",
    ttl: IDEMPOTENCE_TTL,
  });
  readonly #recover = new Valkery<unknown>({
    key: "recover-idem",
    ttl: IDEMPOTENCE_TTL,
  });
  readonly #index = new KeyIndex(
    INDEX_KEY,
    IDEMPOTENCE_TTL.inSeconds,
    "auth-cache:session",
  );

  /** What the last refresh under `key` answered, or null when none did. */
  refreshed<T>(key: string): Promise<T | null> {
    return this.#refresh.get(key) as Promise<T | null>;
  }

  /** Remembers what a refresh answered, indexed under the account so a revocation drops it. */
  async rememberRefreshed<T>(id: string, key: string, value: T): Promise<void> {
    await Promise.all([
      this.#refresh.add(key, value),
      this.#index.remember(id, `${REFRESH_ENTRY}${key}`),
    ]);
  }

  /** What the last recovery under `key` answered, or null when none did. */
  recovered<T>(key: string): Promise<T | null> {
    return this.#recover.get(key) as Promise<T | null>;
  }

  /** Remembers what a recovery answered, indexed under the account so a revocation drops it. */
  async rememberRecovered<T>(id: string, key: string, value: T): Promise<void> {
    await Promise.all([
      this.#recover.add(key, value),
      this.#index.remember(id, `${RECOVER_ENTRY}${key}`),
    ]);
  }

  /** Drops every answer remembered for this account, so a revoked session is not handed back. */
  async invalidate(id: string): Promise<void> {
    const entries = await this.#index.members(id);

    await Promise.all(
      entries.map((entry) =>
        entry.startsWith(REFRESH_ENTRY)
          ? this.#refresh.delete(entry.slice(REFRESH_ENTRY.length))
          : this.#recover.delete(entry.slice(RECOVER_ENTRY.length))
      ),
    );

    await this.#index.forget(id);
  }
}

/** What a refresh and a recovery already answered, for the fifteen seconds a retry lands in. */
export const sessionIdempotence: SessionIdempotence = new SessionIdempotence();

/** Why a session could not be renewed, ended or given up. */
export enum SessionError {
  /** The tokens do not open a session, or no longer do. */
  Unauthorized = "unauthorized",

  /** The caller has been tried too often. */
  TooManyRequests = "too_many_requests",

  /** Something failed that the caller can do nothing about. */
  Unexpected = "unexpected",
}

/** The tokens a renewed session is made of. */
export interface SessionTokens {
  /** The token that authenticates the next requests. */
  readonly access_token: string;

  /** The token that buys a new access token when this one runs out. */
  readonly refresh_token: string;

  /** How many seconds the access token is good for. */
  readonly expires_in: number;

  /** What kind of token the access token is, which is always a bearer. */
  readonly token_type: string;

  /** The role the account holds, read from the token rather than from the database. */
  readonly role: AccountRole | null;
}

/** Whether the session answered, and what stopped it when it did not. */
export type SessionResult<T> = Result<T, SessionError>;

const REFRESH = rateLimit({
  key: "session:refresh",
  limit: 30,
  window: Duration.minutes(1),
  penalty: Duration.minutes(1),
  maxPenalty: Duration.minutes(10),
  failOpen: false,
});

const RECOVER = rateLimit({
  key: "session:recover",
  limit: 30,
  window: Duration.minutes(1),
  penalty: Duration.minutes(1),
  maxPenalty: Duration.minutes(10),
  failOpen: false,
});

const DELETE = rateLimit({
  key: "session:delete",
  limit: 3,
  window: Duration.hours(1),
  penalty: Duration.hours(1),
  maxPenalty: Duration.hours(24),
  failOpen: false,
});

/** Who is calling, as far as the request says. */
interface Caller {
  /** The account the request authenticated as. */
  readonly id: string;

  /** The token it authenticated with. */
  readonly token: string;
}

function caller(): Caller | null {
  const identity = currentIdentity();
  if (!identity) return null;

  const token = request.token();
  return token === null ? null : { id: identity.id, token };
}

/**
 * A session once it exists: renewing it, giving it up, and giving up the account with it.
 *
 * Renewal and recovery are both answered from a fifteen-second memory of what they last said. A
 * client that retries on a slow answer would otherwise be handed a second session while the first
 * is still in flight, and the identity provider would have rotated the refresh token under it.
 */
export class AccountSession {
  /**
   * Whether this account may still hold a session at all.
   *
   * A ban and a kicked device both take hold here rather than on every request. A client comes
   * back for a new access token once an hour, so this is what turns a ban into a session that
   * stops, and it costs two cached reads at that cadence instead of two per request.
   *
   * An access token already issued outlives this by whatever is left of its hour. Closing that
   * window would mean asking the same two questions on every request the process serves.
   */
  async #stillAllowed(id: string): Promise<boolean> {
    if ((await standingBanOn(id)) !== null) return false;

    const device = await devices.verify(id);
    return device === DeviceCheck.Ok;
  }

  /** Buys a new access token with a refresh token. */
  async refresh(refreshToken: string): Promise<SessionResult<SessionTokens>> {
    const key = await sha256Hex(refreshToken);

    const rate = await checkCaller(REFRESH, key);
    if (!rate.ok) return new Failure(SessionError.TooManyRequests);

    const remembered = await sessionIdempotence.refreshed<SessionTokens>(key);
    if (remembered) return new Ok(remembered);

    const answer = await goTrue.session.refreshToken(refreshToken);
    if (!answer.ok) return new Failure(SessionError.Unauthorized);

    const session = AuthMapper.account.session(answer.data);
    if (!session.user || !session.access_token) {
      return new Failure(SessionError.Unauthorized);
    }

    if (!(await this.#stillAllowed(session.user.id))) {
      await AccountRevocation.sessions(session.user.id, session.access_token);
      return new Failure(SessionError.Unauthorized);
    }

    const tokens: SessionTokens = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      token_type: session.token_type,
      role: AuthMapper.account.role(answer.data),
    };

    await Promise.all([
      sessionIdempotence.rememberRefreshed(session.user.id, key, tokens),
      this.seen(session.user.id),
    ]);

    return new Ok(tokens);
  }

  /**
   * Answers with a working session from whatever tokens a client still holds.
   *
   * The access token is tried first because it costs nothing when it is still good. Only when it
   * is not does the refresh token get spent, which is what keeps a client that opens on a warm
   * token from rotating it for no reason.
   */
  async recover(
    accessToken: string,
    refreshToken: string,
  ): Promise<SessionResult<SessionTokens>> {
    if (!accessToken.trim() || !refreshToken.trim()) {
      return new Failure(SessionError.Unauthorized);
    }

    const key = await sha256Hex(`${accessToken}.${refreshToken}`);

    const rate = await checkCaller(RECOVER, await sha256Hex(refreshToken));
    if (!rate.ok) return new Failure(SessionError.TooManyRequests);

    const remembered = await sessionIdempotence.recovered<SessionTokens>(key);
    if (remembered) return new Ok(remembered);

    const held = await goTrue.session.user(accessToken);

    if (held.ok) {
      const user = AuthMapper.account.user(held.data);

      if (!(await this.#stillAllowed(user.id))) {
        await AccountRevocation.sessions(user.id, accessToken);
        return new Failure(SessionError.Unauthorized);
      }

      const tokens: SessionTokens = {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: AuthMapper.jwt.expiresInUnverified(accessToken),
        token_type: "bearer",
        role: AuthMapper.account.role(held.data),
      };

      await Promise.all([
        sessionIdempotence.rememberRecovered(user.id, key, tokens),
        this.seen(user.id),
      ]);

      return new Ok(tokens);
    }

    const renewed = await this.refresh(refreshToken);
    return renewed.ok ? renewed : new Failure(SessionError.Unauthorized);
  }

  /** Ends the session this request came with, and drops everything that remembered it. */
  async signOut(): Promise<SessionResult<void>> {
    const who = caller();
    if (who === null) return new Failure(SessionError.Unauthorized);

    await AccountRevocation.sessions(who.id, who.token);

    return okay;
  }

  /**
   * Gives up the account, its sessions, its devices and everything hanging off it.
   *
   * The rows go by the foreign keys that point at the account, so nothing here has to know what a
   * project put beside it.
   */
  async delete(): Promise<SessionResult<void>> {
    const who = caller();
    if (who === null) return new Failure(SessionError.Unauthorized);

    const rate = await DELETE.check("", await sha256Hex(who.id));
    if (!rate.ok) return new Failure(SessionError.TooManyRequests);

    await Promise.all([
      devices.kickAll(who.id),
      goTrue.session.logout(who.token, SignOutScope.Global),
    ]);

    const removed = await goTrue.user.delete(who.id);
    if (!removed.ok) return new Failure(SessionError.Unexpected);

    await AccountRevocation.caches(who.id);

    return okay;
  }

  /** Writes down where this request came from, so a session list shows where it was last used. */
  async seen(id: string): Promise<boolean> {
    const device = await requestDevice();
    if (!device) return false;

    const { city, country } = await currentLocation();

    return await devices.origin(id, device.device_id, {
      ip: request.ip(),
      city,
      country,
      appVersion: device.app_version,
    });
  }
}

/** The session of whoever is calling. */
export const session: AccountSession = new AccountSession();
