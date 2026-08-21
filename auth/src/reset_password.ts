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
import { Failure, OK, type Result } from "@scribe/core/contracts/result.ts";
import { checkCaller } from "@scribe/core/runtime/http/caller.ts";
import { sha256Hex } from "@scribe/core/runtime/support/crypto/hash.ts";
import { RateLimit } from "@scribe/foundation/src/rate_limit/mod.ts";
import { Channel } from "../contracts/channel.ts";
import type { AccountRole } from "../contracts/role.ts";
import { accountPassword, PasswordError } from "./password.ts";
import { accountWith, identifiersOf } from "./identity.ts";
import { isRateLimitCode } from "./gotrue/errors.ts";
import { goTrue } from "./gotrue/gotrue_client.ts";
import { AccountRevocation } from "./revocation.ts";
import { SmsIntent, smsIntent } from "./sms_intent.ts";
import { MAX_PENDING_TOKEN_CHARS, PendingToken, PendingTokenPurpose } from "./pending_token.ts";
import { AuthValidator, EmailCheckStatus, PhoneCheckStatus } from "./validator.ts";

/** Why a reset could not be asked for or finished. */
export enum ResetPasswordError {
  /** No address was given. */
  EmailRequired = "email_required",

  /** The address is not one. */
  InvalidEmail = "invalid_email",

  /** No number was given. */
  PhoneRequired = "phone_required",

  /** The number is not one. */
  InvalidPhone = "invalid_phone",

  /** The pending token is wrong, spent, or was minted for another role. */
  InvalidOrExpiredToken = "invalid_or_expired_token",

  /** The code sent to the number is wrong or spent. */
  InvalidCode = "invalid_code",

  /** The two copies of the new password are not the same. */
  PasswordsDoNotMatch = "passwords_do_not_match",

  /** The new password is too weak for what the identity provider accepts. */
  InvalidPassword = "invalid_password",

  /** The caller, or the account it is aiming at, has been tried too often. */
  TooManyRequests = "too_many_requests",

  /** Something failed that the caller can do nothing about. */
  Unexpected = "unexpected",
}

/** Whether the reset went through, and what stopped it when it did not. */
export type ResetPasswordResult = Result<void, ResetPasswordError>;

/** What a caller gets back once a code has proven the holder is there. */
export interface ResetPasswordPending {
  /** The token that buys one password change, spent by `complete`. */
  readonly pendingToken: string;
}

function callerLimit(role: string, channel: Channel): RateLimit {
  return new RateLimit({
    key: `reset-password:${channel}:${role}`,
    limit: 10,
    window: Time.minutes(5),
    penalty: Time.minutes(5),
    maxPenalty: Time.hours(24),
    failOpen: false,
  });
}

function recipientLimit(role: string, channel: Channel): RateLimit {
  return new RateLimit({
    key: `reset-password:${channel}:${role}:to`,
    limit: 1,
    window: Time.seconds(90),
    penalty: Time.seconds(90),
    maxPenalty: Time.seconds(90),
    failOpen: false,
  });
}

const REFUSALS: Readonly<Record<PasswordError, ResetPasswordError>> = {
  [PasswordError.PasswordsDoNotMatch]: ResetPasswordError.PasswordsDoNotMatch,
  [PasswordError.InvalidPassword]: ResetPasswordError.InvalidPassword,
  [PasswordError.TooManyRequests]: ResetPasswordError.TooManyRequests,
  [PasswordError.SameAsCurrentPassword]: ResetPasswordError.InvalidPassword,
  [PasswordError.InvalidCurrentPassword]: ResetPasswordError.Unexpected,
  [PasswordError.Unexpected]: ResetPasswordError.Unexpected,
};

/**
 * Setting a new password without holding the old one, for one role.
 *
 * The two ways in differ in what proves the holder is there: a link sent by mail, which the
 * identity provider checks itself, or a code sent by text message, which this exchanges for a
 * pending token. Both end at `complete`, which spends the token and writes the password.
 *
 * @remarks
 * Asking never says whether an address or a number is in use. A reset that answered differently
 * for a known and an unknown address would be a way of asking the framework who has an account,
 * so the rate limit is the only thing that refuses.
 */
export class ResetPassword {
  readonly #role: AccountRole;
  readonly #token = new PendingToken(PendingTokenPurpose.PasswordReset);

  constructor(role: AccountRole) {
    this.#role = role;
  }

  /** Sends a link to `email`, which the identity provider turns into a recovery session. */
  async email(email: string): Promise<ResetPasswordResult> {
    const caller = await checkCaller(callerLimit(this.#role, Channel.Email));
    if (!caller.ok) return new Failure(ResetPasswordError.TooManyRequests);

    const checked = AuthValidator.email.check(email);
    if (checked.status === EmailCheckStatus.Empty) return new Failure(ResetPasswordError.EmailRequired);
    if (checked.status === EmailCheckStatus.Invalid) return new Failure(ResetPasswordError.InvalidEmail);

    const recipient = await recipientLimit(this.#role, Channel.Email)
      .check("", await sha256Hex(AuthValidator.email.inbox(checked.value)));
    if (!recipient.ok) return new Failure(ResetPasswordError.TooManyRequests);

    const sent = await goTrue.resetPassword.recoverPasswordByEmail(checked.value, this.#role);

    if (!sent.ok) {
      if (isRateLimitCode(sent.error.code)) return new OK();

      switch (sent.error.code) {
        case "validation_failed":
        case "email_address_invalid":
        case "email_address_not_authorized":
          return new Failure(ResetPasswordError.InvalidEmail);
        default:
          return new Failure(ResetPasswordError.Unexpected);
      }
    }

    return new OK();
  }

  /** Sends a code to `phone`, which `confirmPhone` exchanges for a pending token. */
  async phone(phone: string): Promise<ResetPasswordResult> {
    const caller = await checkCaller(callerLimit(this.#role, Channel.Phone));
    if (!caller.ok) return new Failure(ResetPasswordError.TooManyRequests);

    const checked = AuthValidator.phone.check(phone);
    if (checked.status === PhoneCheckStatus.Empty) return new Failure(ResetPasswordError.PhoneRequired);
    if (checked.status === PhoneCheckStatus.Invalid) return new Failure(ResetPasswordError.InvalidPhone);

    const number = AuthValidator.phone.format(checked.value);

    const recipient = await recipientLimit(this.#role, Channel.Phone).check("", await sha256Hex(number));
    if (!recipient.ok) return new Failure(ResetPasswordError.TooManyRequests);

    await smsIntent.mark(number, SmsIntent.ResetPassword);

    const sent = await goTrue.signIn.phone.send(number, this.#role);
    if (!sent.ok) {
      await smsIntent.consume(number);
      return new Failure(
        isRateLimitCode(sent.error.code) ? ResetPasswordError.TooManyRequests : ResetPasswordError.Unexpected,
      );
    }

    return new OK();
  }

  /** Exchanges the code sent to a number for the token that buys one password change. */
  async confirmPhone(phone: string, code: string): Promise<Result<ResetPasswordPending, ResetPasswordError>> {
    const number = AuthValidator.phone.format(phone);
    if (!AuthValidator.phone.isValid(number)) return new Failure(ResetPasswordError.InvalidPhone);

    if ((await smsIntent.consume(number)) !== SmsIntent.ResetPassword) {
      return new Failure(ResetPasswordError.InvalidCode);
    }

    const answer = await goTrue.signIn.phone.verify(number, code);
    if (!answer.ok) {
      return new Failure(
        isRateLimitCode(answer.error.code) ? ResetPasswordError.TooManyRequests : ResetPasswordError.InvalidCode,
      );
    }

    const accessToken = answer.data.access_token;
    if (typeof accessToken === "string") await AccountRevocation.session(accessToken);

    const pendingToken = await this.#token.issue(number, this.#role, null);
    return pendingToken ? new OK({ pendingToken }) : new Failure(ResetPasswordError.Unexpected);
  }

  /**
   * Turns a recovery session into the token that buys one password change.
   *
   * The recovery session is revoked on the way: it was minted only to prove that the link was
   * followed, and leaving it alive would let it be used as an ordinary session.
   */
  async fromRecovery(id: string, recoveryToken: string): Promise<Result<ResetPasswordPending, ResetPasswordError>> {
    await AccountRevocation.session(recoveryToken);

    const identifiers = await identifiersOf(id);
    const identifier = identifiers?.email ?? identifiers?.phone ?? null;
    if (identifier === null) return new Failure(ResetPasswordError.Unexpected);

    const pendingToken = await this.#token.issue(identifier, this.#role, null);
    return pendingToken ? new OK({ pendingToken }) : new Failure(ResetPasswordError.Unexpected);
  }

  /** Spends the pending token and writes the new password. */
  async complete(token: string, next: string, confirmation: string): Promise<ResetPasswordResult> {
    const trimmed = token.trim();
    if (!trimmed || trimmed.length > MAX_PENDING_TOKEN_CHARS) {
      return new Failure(ResetPasswordError.InvalidOrExpiredToken);
    }

    const payload = await this.#token.payload(trimmed);
    if (!payload || payload.role !== this.#role) {
      return new Failure(ResetPasswordError.InvalidOrExpiredToken);
    }

    if (next !== confirmation) return new Failure(ResetPasswordError.PasswordsDoNotMatch);
    if (!(await this.#token.exists(trimmed))) {
      return new Failure(ResetPasswordError.InvalidOrExpiredToken);
    }

    const id = await accountWith(payload.identifier);
    if (id === null) return new Failure(ResetPasswordError.InvalidOrExpiredToken);

    if (!(await this.#token.consume(trimmed))) {
      return new Failure(ResetPasswordError.InvalidOrExpiredToken);
    }

    const written = await accountPassword.reset(id, next, confirmation);
    return written.ok ? new OK() : new Failure(REFUSALS[written.error]);
  }
}
