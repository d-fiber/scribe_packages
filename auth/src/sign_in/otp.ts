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

import { SignOutScope } from "@scribe/core/contracts/account.ts";
import { Duration } from "@scribe/alchemy";
import { Failure, Ok, type Result } from "@scribe/alchemy";
import { requestDevice } from "@scribe/core/runtime/device/device.ts";
import { sha256Hex } from "@scribe/core/runtime/support/crypto/hash.ts";
import { rateLimit } from "@scribe/alchemy";
import type { RateLimiter } from "@scribe/alchemy";
import { kv } from "@scribe/foundation/lib/src/redis/mod.ts";
import type { Channel } from "../../contracts/channel.ts";
import type { AccountRole } from "../../contracts/role.ts";
import { devices } from "../devices/devices.ts";
import { isRateLimitCode } from "../gotrue/errors.ts";
import { AuthMapper } from "../gotrue/mappers.ts";
import type { AuthError, GoTrueSessionResponse } from "../gotrue/transport.ts";
import { MAX_PENDING_TOKEN_CHARS, PendingToken } from "../pending_token.ts";
import { AccountRevocation } from "../revocation.ts";
import { OtpError } from "./errors.ts";

/**
 * How a one-time code travels to whoever is signing in, and how it comes back.
 *
 * The challenge itself knows nothing of addresses or numbers: it holds the pending token, the
 * budget and the attempt count, and asks this for the two things that differ.
 */
export interface OtpChannel {
  /** The door this channel is, which is what the hook is told and the limits are keyed on. */
  readonly channel: Channel;

  /** Sends a code to `identifier`, on behalf of an account holding `role`. */
  send(identifier: string, role: AccountRole): Promise<Result<void, AuthError>>;

  /** Exchanges a code for a session. */
  verify(
    identifier: string,
    otp: string,
  ): Promise<Result<GoTrueSessionResponse, AuthError>>;

  /** Which role `identifier` belongs to, or null when it belongs to none. */
  roleOf(identifier: string): Promise<AccountRole | null>;
}

/** How many codes one pending challenge may be tried with before it is spent. */
const ATTEMPTS_PER_CHALLENGE = 5;

const CODE = /^[0-9]{6}$/;

/** What a challenge hands back when it starts, so the caller can come back with a code. */
export interface OtpStarted {
  /** The token that names this challenge, which the caller returns with its code. */
  readonly pendingToken: string;
}

/** The session a code was exchanged for. */
export interface OtpSession {
  /** The token that authenticates the next requests. */
  readonly access_token: string;

  /** The token that buys a new access token when this one runs out. */
  readonly refresh_token: string;

  /** How many seconds the access token is good for. */
  readonly expires_in: number;

  /** What kind of token the access token is, which is always a bearer. */
  readonly token_type: string;

  /** The account the session belongs to. */
  readonly account_id: string;

  /** The role that account holds. */
  readonly role: AccountRole;

  /** The token the client has to keep to be recognised as the same device next time. */
  readonly device_token: string;
}

/** What came of holding an exchange to its budget. */
type Budget =
  | { readonly ok: true }
  | {
    readonly ok: false;

    /** Whether the pending challenge is spent along with the refusal. */
    readonly consume: boolean;
  };

async function attemptsOf(
  prefix: string,
  fingerprint: string,
): Promise<number | null> {
  const key = `rl:${prefix}:global:${fingerprint}`;

  try {
    const attempts = await kv().incr(key);
    if (attempts === 1) await kv().expire(key, Duration.minutes(10).inSeconds);
    return attempts;
  } catch (e) {
    console.error(`[otp-challenge:${prefix}] attempt counter unavailable:`, e);
    return null;
  }
}

async function withinChallenge(
  prefix: string,
  fingerprint: string,
): Promise<Budget | null> {
  const attempts = await attemptsOf(prefix, fingerprint);

  if (attempts === null) return { ok: false, consume: false };
  if (attempts > ATTEMPTS_PER_CHALLENGE) return { ok: false, consume: true };

  return null;
}

function recipientLimit(prefix: string, role: AccountRole): RateLimiter {
  return rateLimit({
    key: `sign-in:${role}:${prefix}:to`,
    limit: 10,
    window: Duration.minutes(15),
    penalty: Duration.minutes(15),
    maxPenalty: Duration.minutes(15),
    failOpen: false,
  });
}

function resendCadence(role: AccountRole): RateLimiter {
  return rateLimit({
    key: `sign-in:${role}:resend-otp:cadence`,
    limit: 1,
    window: Duration.seconds(90),
    penalty: Duration.seconds(90),
    maxPenalty: Duration.seconds(90),
    failOpen: false,
  });
}

/**
 * The second half of a sign-in from a device nobody has seen before.
 *
 * A challenge is two exchanges: a code goes out and a pending token comes back, then the caller
 * returns with both and gets a session. The token names the challenge, carries the identifier and
 * the device it was minted for, and is signed, so nothing about the challenge has to be trusted
 * to the caller.
 *
 * @remarks
 * A refusal that has run out of attempts spends the challenge instead of merely saying no. Without
 * that, a script could keep a challenge alive indefinitely by waiting out each refusal, which
 * would turn a six-digit code with five tries into a six-digit code with as many as patience
 * allows.
 */
export class OtpChallenge {
  readonly #role: AccountRole;
  readonly #channel: OtpChannel;
  readonly #token: PendingToken;

  constructor(
    role: AccountRole,
    channel: OtpChannel,
    token: PendingToken = new PendingToken(),
  ) {
    this.#role = role;
    this.#channel = channel;
    this.#token = token;
  }

  /** Sends a code to `identifier` and answers the token the caller comes back with. */
  async start(identifier: string): Promise<Result<OtpStarted, OtpError>> {
    const sent = await this.#channel.send(identifier, this.#role);
    if (!sent.ok) {
      return new Failure(
        isRateLimitCode(sent.error.code)
          ? OtpError.TooManyRequests
          : OtpError.Unexpected,
      );
    }

    const device = await requestDevice();
    const pendingToken = await this.#token.issue(
      identifier,
      this.#role,
      device?.device_id ?? null,
    );

    return pendingToken
      ? new Ok({ pendingToken })
      : new Failure(OtpError.Unexpected);
  }

  /** Sends another code for a challenge already open, and replaces its token. */
  async resend(token: string): Promise<Result<OtpStarted, OtpError>> {
    const opened = await this.#open(token);
    if (!opened.ok) return new Failure(opened.error);

    const { identifier, deviceId, fingerprint } = opened.data;

    const budget = await this.#budget(
      "resend-otp",
      fingerprint,
      identifier,
      true,
    );
    if (!budget.ok) return new Failure(await this.#spend(token, budget));

    if (!(await this.#token.exists(token))) {
      return new Failure(OtpError.InvalidOrExpired);
    }
    if ((await this.#channel.roleOf(identifier)) !== this.#role) {
      return new Failure(OtpError.InvalidOrExpired);
    }

    const sent = await this.#channel.send(identifier, this.#role);
    if (!sent.ok) {
      return new Failure(
        isRateLimitCode(sent.error.code)
          ? OtpError.TooManyRequests
          : OtpError.Unexpected,
      );
    }

    const pendingToken = await this.#token.issue(
      identifier,
      this.#role,
      deviceId,
    );
    if (!pendingToken) return new Failure(OtpError.Unexpected);

    await this.#token.consume(token);
    return new Ok({ pendingToken });
  }

  /** Exchanges a code for a session, and records the device it came from. */
  async verify(
    token: string,
    otp: string,
  ): Promise<Result<OtpSession, OtpError>> {
    if (!CODE.test(otp)) return new Failure(OtpError.InvalidOrExpired);

    const opened = await this.#open(token);
    if (!opened.ok) return new Failure(opened.error);

    const { identifier, fingerprint } = opened.data;

    const budget = await this.#budget(
      "verify-otp",
      fingerprint,
      identifier,
      false,
    );
    if (!budget.ok) return new Failure(await this.#spend(token, budget));

    if (!(await this.#token.exists(token))) {
      return new Failure(OtpError.InvalidOrExpired);
    }

    const answer = await this.#channel.verify(identifier, otp);
    if (!answer.ok) {
      if (isRateLimitCode(answer.error.code)) {
        return new Failure(OtpError.TooManyRequests);
      }
      return new Failure(
        answer.error.code === "otp_disabled"
          ? OtpError.Unexpected
          : OtpError.InvalidOrExpired,
      );
    }

    const session = AuthMapper.account.session(answer.data);
    if (!session.user || !session.access_token) {
      return new Failure(OtpError.Unexpected);
    }

    const accessToken = session.access_token;

    if (AuthMapper.account.role(answer.data) !== this.#role) {
      await AccountRevocation.session(accessToken, SignOutScope.Global);
      return new Failure(OtpError.InvalidOrExpired);
    }

    const [consumed, deviceToken] = await Promise.all([
      this.#token.consume(token),
      devices.register(session.user.id),
    ]);

    if (!consumed) {
      await AccountRevocation.session(accessToken);
      return new Failure(OtpError.InvalidOrExpired);
    }

    if (deviceToken === null) {
      await AccountRevocation.session(accessToken);
      return new Failure(OtpError.Unexpected);
    }

    return new Ok({
      access_token: accessToken,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      token_type: session.token_type,
      account_id: session.user.id,
      role: this.#role,
      device_token: deviceToken,
    });
  }

  async #open(
    token: string,
  ): Promise<
    Result<
      { identifier: string; deviceId: string | null; fingerprint: string },
      OtpError
    >
  > {
    const trimmed = token.trim();
    if (!trimmed || trimmed.length > MAX_PENDING_TOKEN_CHARS) {
      return new Failure(OtpError.InvalidOrExpired);
    }

    const payload = await this.#token.payload(trimmed);
    if (!payload || payload.role !== this.#role) {
      return new Failure(OtpError.InvalidOrExpired);
    }

    const device = await requestDevice();
    if ((device?.device_id ?? null) !== payload.deviceId) {
      return new Failure(OtpError.InvalidOrExpired);
    }

    return new Ok({
      identifier: payload.identifier,
      deviceId: payload.deviceId,
      fingerprint: await sha256Hex(trimmed),
    });
  }

  async #budget(
    prefix: string,
    fingerprint: string,
    identifier: string,
    cadence: boolean,
  ): Promise<Budget> {
    const challenge = await withinChallenge(prefix, fingerprint);
    if (challenge !== null) return challenge;

    const recipient = await sha256Hex(identifier);

    const perRecipient = await recipientLimit(prefix, this.#role).check(
      "",
      recipient,
    );
    if (!perRecipient.ok) return { ok: false, consume: false };

    if (cadence) {
      const paced = await resendCadence(this.#role).check("", recipient);
      if (!paced.ok) return { ok: false, consume: false };
    }

    return { ok: true };
  }

  async #spend(
    token: string,
    budget: { ok: false; consume: boolean },
  ): Promise<OtpError> {
    if (!budget.consume) return OtpError.TooManyRequests;

    await this.#token.consume(token.trim());
    return OtpError.InvalidOrExpired;
  }
}
