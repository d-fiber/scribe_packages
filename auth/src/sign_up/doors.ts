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

import { Failure, Ok, type Result } from "@scribe/alchemy";
import { sha256Hex } from "@scribe/core/runtime/support/crypto/hash.ts";
import { Channel } from "../../contracts/channel.ts";
import { isRateLimitCode } from "../gotrue/errors.ts";
import { goTrue } from "../gotrue/gotrue_client.ts";
import { SocialProvider } from "../gotrue/primitives.ts";
import { AuthValidator, EmailCheckStatus, PasswordCheckStatus, PhoneCheckStatus } from "../validator.ts";
import { SignUpError } from "./errors.ts";

/** What the identity provider issued once the credentials were accepted. */
export interface IssuedIdentity {
  /** The identifier the provider minted, which the account row is written under. */
  readonly id: string;

  /** The address the account signs in with, null when it came through another channel. */
  readonly email: string | null;

  /** The number the account signs in with, null when it came through another channel. */
  readonly phone: string | null;
}

/**
 * One door of a sign-up: how its credentials are read, and how a user is minted from them.
 *
 * The rest of a sign-up does not change from one door to the next, so this is all the three of
 * them keep apart. Writing it three times over is what the framework used to do, and the copies
 * had drifted: the social path never checked the recipient rate limit the other two did.
 */
export interface SignUpCredential<TInput> {
  /** The door this credential opens, which is what the hook is told and the limits are keyed on. */
  readonly channel: Channel;

  /**
   * Reads the credentials, and answers what a rate limit on the recipient should be keyed on.
   *
   * A refusal here happens before anything is minted, so nothing has to be undone.
   */
  read(input: TInput): Promise<Result<{ recipient: string | null }, SignUpError>>;

  /** Mints the user at the identity provider, once the credentials have been read. */
  issue(input: TInput): Promise<Result<IssuedIdentity, SignUpError>>;
}

/** What a caller sends to sign up with an address. */
export interface EmailCredentials {
  /** The address the account will sign in with. */
  readonly email: string;

  /** The password it will sign in with. */
  readonly password: string;
}

/** What a caller sends to sign up with a number. */
export interface PhoneCredentials {
  /** The number the account will sign in with. */
  readonly phone: string;

  /** The password it will sign in with. */
  readonly password: string;
}

/** What a caller sends to sign up with an identity another provider vouched for. */
export interface SocialCredentials {
  /** The identity token the provider issued. */
  readonly idToken: string;

  /** The nonce the client bound that token to. */
  readonly nonce: string;

  /** The access token the provider issued alongside it, when it did. */
  readonly accessToken?: string;
}

function passwordRefusal(password: string): SignUpError | null {
  switch (AuthValidator.password.check(password).status) {
    case PasswordCheckStatus.Empty:
      return SignUpError.PasswordRequired;
    case PasswordCheckStatus.Invalid:
      return SignUpError.InvalidPassword;
    default:
      return null;
  }
}

/** The door an address opens. */
export class EmailCredential<TInput extends EmailCredentials> implements SignUpCredential<TInput> {
  readonly channel = Channel.Email;

  async read(input: TInput): Promise<Result<{ recipient: string | null }, SignUpError>> {
    const email = AuthValidator.email.check(input.email);
    if (email.status === EmailCheckStatus.Empty) return new Failure(SignUpError.EmailRequired);
    if (email.status === EmailCheckStatus.Invalid) return new Failure(SignUpError.InvalidEmail);

    const refusal = passwordRefusal(input.password);
    if (refusal !== null) return new Failure(refusal);

    return new Ok({ recipient: await sha256Hex(AuthValidator.email.inbox(email.value)) });
  }

  async issue(input: TInput): Promise<Result<IssuedIdentity, SignUpError>> {
    const email = AuthValidator.email.check(input.email).value ?? input.email;
    const answer = await goTrue.signUp.createUserWithEmail(email, input.password);

    if (!answer.ok) {
      if (isRateLimitCode(answer.error.code)) return new Failure(SignUpError.TooManyRequests);

      switch (answer.error.code) {
        case "user_already_exists":
        case "email_exists":
          return new Failure(SignUpError.EmailAlreadyExists);
        case "weak_password":
          return new Failure(SignUpError.InvalidPassword);
        case "email_address_invalid":
          return new Failure(SignUpError.InvalidEmail);
        default:
          return new Failure(SignUpError.Unexpected);
      }
    }

    const id = answer.data.user?.id;
    if (!id) return new Failure(SignUpError.Unexpected);

    return new Ok({ id, email, phone: null });
  }
}

/** The door a number opens. */
export class PhoneCredential<TInput extends PhoneCredentials> implements SignUpCredential<TInput> {
  readonly channel = Channel.Phone;

  async read(input: TInput): Promise<Result<{ recipient: string | null }, SignUpError>> {
    const phone = AuthValidator.phone.check(input.phone);
    if (phone.status === PhoneCheckStatus.Empty) return new Failure(SignUpError.PhoneRequired);
    if (phone.status === PhoneCheckStatus.Invalid) return new Failure(SignUpError.InvalidPhone);

    const refusal = passwordRefusal(input.password);
    if (refusal !== null) return new Failure(refusal);

    return new Ok({ recipient: await sha256Hex(AuthValidator.phone.format(input.phone)) });
  }

  async issue(input: TInput): Promise<Result<IssuedIdentity, SignUpError>> {
    const phone = AuthValidator.phone.format(input.phone);
    const answer = await goTrue.signUp.createUserWithPhone(phone, input.password);

    if (!answer.ok) {
      if (isRateLimitCode(answer.error.code)) return new Failure(SignUpError.TooManyRequests);

      switch (answer.error.code) {
        case "phone_provider_not_configured":
          return new Failure(SignUpError.ProviderNotConfigured);
        case "user_already_exists":
        case "phone_exists":
          return new Failure(SignUpError.PhoneAlreadyExists);
        case "weak_password":
          return new Failure(SignUpError.InvalidPassword);
        default:
          return new Failure(SignUpError.Unexpected);
      }
    }

    const id = answer.data.user?.id;
    if (!id) return new Failure(SignUpError.Unexpected);

    return new Ok({ id, email: null, phone });
  }
}

/** The door an identity another provider vouched for opens. */
export class SocialCredential<TInput extends SocialCredentials> implements SignUpCredential<TInput> {
  readonly channel: Channel;
  readonly #provider: SocialProvider;

  constructor(channel: Channel.Google | Channel.Apple) {
    this.channel = channel;
    this.#provider = channel === Channel.Google ? SocialProvider.Google : SocialProvider.Apple;
  }

  read(input: TInput): Promise<Result<{ recipient: string | null }, SignUpError>> {
    const malformed = input.idToken.trim().length === 0 || input.nonce.trim().length === 0;

    return Promise.resolve(
      malformed ? new Failure(SignUpError.InvalidCredentials) : new Ok({ recipient: null }),
    );
  }

  async issue(input: TInput): Promise<Result<IssuedIdentity, SignUpError>> {
    const answer = this.#provider === SocialProvider.Google
      ? await goTrue.signUp.createUserWithGoogle(input.idToken, input.nonce, input.accessToken)
      : await goTrue.signUp.createUserWithApple(input.idToken, input.nonce, input.accessToken);

    if (!answer.ok) {
      if (isRateLimitCode(answer.error.code)) return new Failure(SignUpError.TooManyRequests);
      if (answer.error.code === "social_provider_not_configured") {
        return new Failure(SignUpError.ProviderNotConfigured);
      }
      return new Failure(SignUpError.Unexpected);
    }

    const id = answer.data.user?.id;
    if (!id) return new Failure(SignUpError.Unexpected);

    return new Ok({ id, email: answer.data.user?.email || null, phone: null });
  }
}
