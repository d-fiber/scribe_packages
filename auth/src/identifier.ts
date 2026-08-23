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

import { Duration } from "@scribe/alchemy";
import { Failure, okay, type Result } from "@scribe/alchemy";
import { currentIdentity } from "@scribe/core/runtime/http/accessors/identity.ts";
import { checkCaller } from "@scribe/core/runtime/http/caller.ts";
import { request } from "@scribe/core/runtime/http/request.ts";
import { sha256Hex } from "@scribe/core/runtime/support/crypto/hash.ts";
import { RateLimit } from "@scribe/foundation/lib/src/rate_limit/mod.ts";
import { devices } from "./devices/devices.ts";
import { goTrue } from "./gotrue/gotrue_client.ts";
import type { AuthError } from "./gotrue/transport.ts";
import { AccountRevocation } from "./revocation.ts";
import { SmsIntent, smsIntent } from "./sms_intent.ts";
import { AuthValidator, EmailCheckStatus, PhoneCheckStatus } from "./validator.ts";

/** Why the address or the number an account signs in with could not be changed. */
export enum IdentifierError {
  /** The address is not one. */
  InvalidEmail = "invalid_email",

  /** The number is not one. */
  InvalidPhone = "invalid_phone",

  /** Another account already signs in with it. */
  Conflict = "conflict",

  /** The code sent to prove the new number is wrong or spent. */
  InvalidCode = "invalid_code",

  /** The caller, or the account it is aiming at, has been tried too often. */
  TooManyRequests = "too_many_requests",

  /** Something failed that the caller can do nothing about. */
  Unexpected = "unexpected",
}

/** Whether the identifier changed, and what stopped it when it did not. */
export type IdentifierResult = Result<void, IdentifierError>;

const CALLER = new RateLimit({
  key: "account:identifier",
  limit: 10,
  window: Duration.minutes(1),
  penalty: Duration.minutes(1),
  maxPenalty: Duration.minutes(30),
  failOpen: false,
});

const TARGET = new RateLimit({
  key: "account:identifier:of",
  limit: 5,
  window: Duration.minutes(15),
  penalty: Duration.minutes(15),
  maxPenalty: Duration.minutes(15),
  failOpen: false,
});

async function held(id: string): Promise<IdentifierError | null> {
  const caller = await checkCaller(CALLER);
  if (!caller.ok) return IdentifierError.TooManyRequests;

  const target = await TARGET.check("", await sha256Hex(id));
  return target.ok ? null : IdentifierError.TooManyRequests;
}

function sessionOfCaller(id: string): string | null {
  const identity = currentIdentity();
  if (!identity || identity.id !== id) return null;

  return request.token();
}

/**
 * The address and the number an account signs in with.
 *
 * The two are here together because what happens around them is the same: hold the rate, ask the
 * identity provider, drop what the caches remembered, tell the hook. Only the proof differs, and
 * that difference is exactly why the number needs a second call and the address does not.
 */
export class AccountIdentifier {
  /**
   * Moves the account to another address, on behalf of whoever holds its session.
   *
   * The identity provider sends a link to the new address, so nothing is in force until it is
   * followed. Sessions are left alone for that reason.
   */
  async email(id: string, email: string): Promise<IdentifierResult> {
    const token = sessionOfCaller(id);
    if (token === null) return new Failure(IdentifierError.Unexpected);

    const checked = AuthValidator.email.check(email);
    if (checked.status !== EmailCheckStatus.Ok) return new Failure(IdentifierError.InvalidEmail);

    return await this.#change(
      id,
      () => goTrue.session.updateIdentifier(token, { email: checked.value }),
      false,
    );
  }

  /**
   * Moves the account to another address without a link, which only an operator may do.
   *
   * The new address is in force immediately, so every session goes: they were opened by whoever
   * held the old one.
   */
  async emailAsOperator(id: string, email: string): Promise<IdentifierResult> {
    const checked = AuthValidator.email.check(email);
    if (checked.status !== EmailCheckStatus.Ok) return new Failure(IdentifierError.InvalidEmail);

    return await this.#change(
      id,
      () => goTrue.user.email.update(id, checked.value),
      true,
    );
  }

  /**
   * Asks for the account to move to another number, which sends a code there.
   *
   * The mark laid before the code goes out is what tells the verification apart from a password
   * reset: the identity provider sends the same message for both, so nothing in what comes back
   * says which one the holder asked for. It is lifted again if the send fails, so a number is not
   * left marked for a change nobody started.
   */
  async phone(id: string, phone: string): Promise<IdentifierResult> {
    const token = sessionOfCaller(id);
    if (token === null) return new Failure(IdentifierError.Unexpected);

    const checked = AuthValidator.phone.check(phone);
    if (checked.status !== PhoneCheckStatus.Ok) return new Failure(IdentifierError.InvalidPhone);

    const number = AuthValidator.phone.format(checked.value);

    return await this.#change(
      id,
      async () => {
        await smsIntent.mark(number, SmsIntent.ChangePhone);

        const answer = await goTrue.session.updateIdentifier(token, { phone: number });
        if (!answer.ok) await smsIntent.consume(number);

        return answer;
      },
      false,
    );
  }

  /** Puts a new number in force once the code sent to it comes back. */
  async confirmPhone(id: string, phone: string, code: string): Promise<IdentifierResult> {
    const refusal = await held(id);
    if (refusal !== null) return new Failure(refusal);

    const number = AuthValidator.phone.format(phone);
    if (!AuthValidator.phone.isValid(number)) return new Failure(IdentifierError.InvalidPhone);

    if ((await smsIntent.consume(number)) !== SmsIntent.ChangePhone) {
      return new Failure(IdentifierError.InvalidCode);
    }

    const answer = await goTrue.session.verifyPhoneChange(number, code);
    if (!answer.ok) return new Failure(IdentifierError.InvalidCode);

    await AccountRevocation.caches(id);

    return okay;
  }

  async #change(
    id: string,
    apply: () => Promise<Result<unknown, AuthError>>,
    endSessions: boolean,
  ): Promise<IdentifierResult> {
    const refusal = await held(id);
    if (refusal !== null) return new Failure(refusal);

    const answer = await apply();

    if (!answer.ok) {
      const taken = answer.error.code === "email_exists" ||
        answer.error.code === "phone_exists" ||
        answer.error.code === "user_already_exists";

      return new Failure(taken ? IdentifierError.Conflict : IdentifierError.Unexpected);
    }

    await AccountRevocation.caches(id);
    if (endSessions) await devices.kickAll(id);

    return okay;
  }
}

/** The address and the number of every account. */
export const accountIdentifier: AccountIdentifier = new AccountIdentifier();
