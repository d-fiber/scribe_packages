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

import { Channel } from "../../contracts/channel.ts";
import type { WriteOf, WriteShape } from "../declaration/columns.ts";
import {
  EmailCredential,
  type EmailCredentials,
  PhoneCredential,
  type PhoneCredentials,
  SocialCredential,
  type SocialCredentials,
} from "./doors.ts";
import type { EmailSignUpError, PhoneSignUpError, SocialSignUpError } from "./errors.ts";
import { SignUpDoor, type SignUpResult, type SignUpTarget } from "./runner.ts";

type Door<TCredentials, TSignUp extends WriteShape, TError> = (
  input: TCredentials & WriteOf<TSignUp>,
) => Promise<SignUpResult<TError>>;

type Opens<TChannels extends readonly Channel[], C extends Channel, T> = C extends TChannels[number] ? T
  : Record<never, never>;

/**
 * The doors a sign-up offers, which are exactly the ones the declaration named.
 *
 * A channel nobody declared has no entry at all, so `user.signUp.phone` on a role that only
 * declared an address does not compile. The check used to live in the constructor of each
 * strategy, where it could only refuse at runtime.
 */
export type SignUpSurface<TChannels extends readonly Channel[], TSignUp extends WriteShape> =
  & Opens<TChannels, Channel.Email, {
    /** Creates the account from an address and a password. */
    email: Door<EmailCredentials, TSignUp, EmailSignUpError>;
  }>
  & Opens<TChannels, Channel.Phone, {
    /** Creates the account from a number and a password. */
    phone: Door<PhoneCredentials, TSignUp, PhoneSignUpError>;
  }>
  & Opens<TChannels, Channel.Google, {
    /** Creates the account from an identity token Google issued. */
    google: Door<SocialCredentials, TSignUp, SocialSignUpError>;
  }>
  & Opens<TChannels, Channel.Apple, {
    /** Creates the account from an identity token Apple issued. */
    apple: Door<SocialCredentials, TSignUp, SocialSignUpError>;
  }>;

// deno-lint-ignore no-explicit-any
type AnyDoor = SignUpDoor<any, any>;

/** Builds the doors a declaration named, and nothing else. */
export function signUpSurface<TChannels extends readonly Channel[], TSignUp extends WriteShape>(
  target: SignUpTarget<TSignUp>,
  channels: TChannels,
): SignUpSurface<TChannels, TSignUp> {
  const surface: Record<string, (input: never) => unknown> = {};

  const open = (name: string, door: AnyDoor): void => {
    surface[name] = (input: never) => door.run(input);
  };

  for (const channel of channels) {
    switch (channel) {
      case Channel.Email:
        open("email", new SignUpDoor(target, new EmailCredential()));
        break;
      case Channel.Phone:
        open("phone", new SignUpDoor(target, new PhoneCredential()));
        break;
      case Channel.Google:
        open("google", new SignUpDoor(target, new SocialCredential(Channel.Google)));
        break;
      case Channel.Apple:
        open("apple", new SignUpDoor(target, new SocialCredential(Channel.Apple)));
        break;
    }
  }

  return surface as SignUpSurface<TChannels, TSignUp>;
}
