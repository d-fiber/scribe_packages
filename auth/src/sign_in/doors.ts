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

import type { Session } from "@scribe/auth/contracts/account.ts";
import { Failure, Ok, type Result } from "@scribe/alchemy";
import { Channel } from "../../contracts/channel.ts";
import type { AccountRole } from "../../contracts/role.ts";
import { isRateLimitCode } from "../gotrue/errors.ts";
import { goTrue } from "../gotrue/gotrue_client.ts";
import { AuthMapper } from "../gotrue/mappers.ts";
import { SocialProvider } from "../gotrue/primitives.ts";
import type { AuthError, GoTrueSessionResponse } from "../gotrue/transport.ts";
import { AccountRoleResolver } from "../identity.ts";
import { AuthValidator, EmailCheckStatus, PasswordPresenceStatus, PhoneCheckStatus } from "../validator.ts";
import { SignInError } from "./errors.ts";
import type { OtpChannel } from "./otp.ts";

/** A session the identity provider issued, with the two fields a sign-in cannot do without. */
export type AuthenticatedSession = Session & {
  /** The account the session belongs to, which the provider always fills on a sign-in. */
  user: NonNullable<Session["user"]>;

  /** The token that authenticates the next requests. */
  access_token: string;
};

/** What the provider answered, and which role the token it minted carries. */
export interface Authenticated {
  /** The session the provider issued. */
  readonly session: AuthenticatedSession;

  /** The role the token carries, which has to be the one that opened this door. */
  readonly role: AccountRole | null;

  /** What the caller identified itself by, which is what a code would be sent to. */
  readonly identifier: string | null;
}

/**
 * One door of a sign-in: how its credentials are read, and how they are turned into a session.
 *
 * Everything that follows is the same whichever door it is, which is why the doors carry only
 * this. `whoIsAsking` is what a rate limit on the account being aimed at is keyed on, so that a
 * flood against one address cannot be hidden behind a rotating pool of callers.
 */
export interface SignInCredential<TInput> {
  /** The door this credential opens. */
  readonly channel: Channel;

  /** How a code reaches the holder, when this door sends one. Absent when it never does. */
  readonly otp?: OtpChannel;

  /** Reads the credentials and answers what a rate limit on the recipient is keyed on. */
  read(
    input: TInput,
  ): Promise<Result<{ identifier: string | null }, SignInError>>;

  /** Turns the credentials into a session, or says why they open nothing. */
  authenticate(
    input: TInput,
    role: AccountRole,
  ): Promise<Result<Authenticated, SignInError>>;
}

/** What a caller sends to sign in with an address. */
export interface EmailCredentials {
  /** The address the account signs in with. */
  readonly email: string;

  /** The password it signs in with. */
  readonly password: string;
}

/** What a caller sends to sign in with a number. */
export interface PhoneCredentials {
  /** The number the account signs in with. */
  readonly phone: string;

  /** The password it signs in with. */
  readonly password: string;
}

/** What a caller sends to sign in with an identity another provider vouched for. */
export interface SocialCredentials {
  /** The identity token the provider issued. */
  readonly idToken: string;

  /** The nonce the client bound that token to. */
  readonly nonce: string;

  /** The access token the provider issued alongside it, when it did. */
  readonly accessToken?: string;
}

function sessionOf(
  raw: GoTrueSessionResponse,
): Result<Authenticated, SignInError> {
  const session = AuthMapper.account.session(raw);
  if (!session.user || !session.access_token) {
    return new Failure(SignInError.Unexpected);
  }

  return new Ok({
    session: session as AuthenticatedSession,
    role: AuthMapper.account.role(raw),
    identifier: null,
  });
}

class EmailOtp implements OtpChannel {
  readonly channel = Channel.Email;

  send(email: string, role: AccountRole): Promise<Result<void, AuthError>> {
    return goTrue.signIn.email.otp.send(email, role);
  }

  verify(
    email: string,
    otp: string,
  ): Promise<Result<GoTrueSessionResponse, AuthError>> {
    return goTrue.signIn.email.otp.verify(email, otp);
  }

  roleOf(email: string): Promise<AccountRole | null> {
    return AccountRoleResolver.withEmail(email);
  }
}

class PhoneOtp implements OtpChannel {
  readonly channel = Channel.Phone;

  send(phone: string, role: AccountRole): Promise<Result<void, AuthError>> {
    return goTrue.signIn.phone.send(phone, role);
  }

  verify(
    phone: string,
    otp: string,
  ): Promise<Result<GoTrueSessionResponse, AuthError>> {
    return goTrue.signIn.phone.verify(phone, otp);
  }

  roleOf(phone: string): Promise<AccountRole | null> {
    return AccountRoleResolver.withPhone(phone);
  }
}

/** The door an address opens. */
export class EmailCredential implements SignInCredential<EmailCredentials> {
  readonly channel = Channel.Email;
  readonly otp: OtpChannel = new EmailOtp();

  read(
    input: EmailCredentials,
  ): Promise<Result<{ identifier: string | null }, SignInError>> {
    const email = AuthValidator.email.check(input.email);
    if (email.status === EmailCheckStatus.Empty) {
      return Promise.resolve(new Failure(SignInError.EmailRequired));
    }
    if (email.status === EmailCheckStatus.Invalid) {
      return Promise.resolve(new Failure(SignInError.InvalidCredentials));
    }

    switch (AuthValidator.password.presence(input.password)) {
      case PasswordPresenceStatus.Empty:
        return Promise.resolve(new Failure(SignInError.PasswordRequired));
      case PasswordPresenceStatus.TooLong:
        return Promise.resolve(new Failure(SignInError.InvalidCredentials));
    }

    return Promise.resolve(new Ok({ identifier: email.value }));
  }

  async authenticate(
    input: EmailCredentials,
    role: AccountRole,
  ): Promise<Result<Authenticated, SignInError>> {
    const email = AuthValidator.email.check(input.email).value ?? input.email;
    const answer = await goTrue.signIn.email.withPassword(
      email,
      input.password,
    );

    if (!answer.ok) {
      if (isRateLimitCode(answer.error.code)) {
        return new Failure(SignInError.TooManyRequests);
      }

      switch (answer.error.code) {
        case "email_not_confirmed":
          await goTrue.signIn.email
            .resendConfirmation(
              email,
              (await AccountRoleResolver.withEmail(email)) ?? role,
            )
            .catch(() => {});
          return new Failure(SignInError.EmailNotConfirmed);
        default:
          return new Failure(SignInError.InvalidCredentials);
      }
    }

    const authenticated = sessionOf(answer.data);
    return authenticated.ok ? new Ok({ ...authenticated.data, identifier: email }) : authenticated;
  }
}

/** The door a number opens. */
export class PhoneCredential implements SignInCredential<PhoneCredentials> {
  readonly channel = Channel.Phone;
  readonly otp: OtpChannel = new PhoneOtp();

  read(
    input: PhoneCredentials,
  ): Promise<Result<{ identifier: string | null }, SignInError>> {
    const phone = AuthValidator.phone.check(input.phone);
    if (phone.status === PhoneCheckStatus.Empty) {
      return Promise.resolve(new Failure(SignInError.PhoneRequired));
    }
    if (phone.status === PhoneCheckStatus.Invalid) {
      return Promise.resolve(new Failure(SignInError.InvalidCredentials));
    }

    switch (AuthValidator.password.presence(input.password)) {
      case PasswordPresenceStatus.Empty:
        return Promise.resolve(new Failure(SignInError.PasswordRequired));
      case PasswordPresenceStatus.TooLong:
        return Promise.resolve(new Failure(SignInError.InvalidCredentials));
    }

    return Promise.resolve(
      new Ok({ identifier: AuthValidator.phone.format(input.phone) }),
    );
  }

  async authenticate(
    input: PhoneCredentials,
  ): Promise<Result<Authenticated, SignInError>> {
    const phone = AuthValidator.phone.format(input.phone);
    const answer = await goTrue.signIn.phone.withPassword(
      phone,
      input.password,
    );

    if (!answer.ok) {
      if (isRateLimitCode(answer.error.code)) {
        return new Failure(SignInError.TooManyRequests);
      }
      if (answer.error.code === "phone_not_confirmed") {
        return new Failure(SignInError.PhoneNotConfirmed);
      }
      if (answer.error.code === "phone_provider_not_configured") {
        return new Failure(SignInError.ProviderNotConfigured);
      }
      return new Failure(SignInError.InvalidCredentials);
    }

    const authenticated = sessionOf(answer.data);
    return authenticated.ok ? new Ok({ ...authenticated.data, identifier: phone }) : authenticated;
  }
}

/** The door an identity another provider vouched for opens. */
export class SocialCredential implements SignInCredential<SocialCredentials> {
  readonly channel: Channel;
  readonly #provider: SocialProvider;

  constructor(channel: Channel.Google | Channel.Apple) {
    this.channel = channel;
    this.#provider = channel === Channel.Google ? SocialProvider.Google : SocialProvider.Apple;
  }

  read(
    input: SocialCredentials,
  ): Promise<Result<{ identifier: string | null }, SignInError>> {
    const malformed = input.idToken.trim().length === 0 || input.nonce.trim().length === 0;

    return Promise.resolve(
      malformed ? new Failure(SignInError.InvalidCredentials) : new Ok({ identifier: null }),
    );
  }

  async authenticate(
    input: SocialCredentials,
  ): Promise<Result<Authenticated, SignInError>> {
    const answer = this.#provider === SocialProvider.Google
      ? await goTrue.signIn.social.google.signIn(
        input.idToken,
        input.nonce,
        input.accessToken,
      )
      : await goTrue.signIn.social.apple.signIn(
        input.idToken,
        input.nonce,
        input.accessToken,
      );

    if (!answer.ok) {
      if (isRateLimitCode(answer.error.code)) {
        return new Failure(SignInError.TooManyRequests);
      }
      if (answer.error.code === "social_provider_not_configured") {
        return new Failure(SignInError.ProviderNotConfigured);
      }
      return new Failure(SignInError.InvalidCredentials);
    }

    return sessionOf(answer.data);
  }
}
