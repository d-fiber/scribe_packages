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

import type { Result } from "@scribe/alchemy";
import { Channel } from "../../contracts/channel.ts";
import {
  EmailCredential,
  type EmailCredentials,
  PhoneCredential,
  type PhoneCredentials,
  SocialCredential,
  type SocialCredentials,
} from "./doors.ts";
import type { OtpError, SignInError } from "./errors.ts";
import type { OtpSession, OtpStarted } from "./otp.ts";
import { type SignedIn, SignInDoor, type SignInTarget } from "./runner.ts";

type Door<TCredentials, TRefusal> = (
  input: TCredentials,
) => Promise<Result<SignedIn, SignInError | TRefusal>>;

/** What a door that sends codes offers beyond signing in. */
export interface OtpDoor {
  /** Sends another code for a challenge already open, and replaces its token. */
  resend(pendingToken: string): Promise<Result<OtpStarted, OtpError>>;

  /** Exchanges a code for a session, and records the device it came from. */
  verify(pendingToken: string, code: string): Promise<Result<OtpSession, OtpError>>;
}

type Opens<TChannels extends readonly Channel[], C extends Channel, T> = C extends TChannels[number] ? T
  : Record<never, never>;

/**
 * The doors a sign-in offers, which are exactly the ones the declaration named.
 *
 * The two that send a code carry `resend` and `verify` beside the sign-in itself, because a
 * challenge belongs to the door that opened it: a code sent to a number cannot be exchanged
 * through the address door, and typing them apart is what says so.
 */
export type SignInSurface<TChannels extends readonly Channel[], TRefusal> =
  & Opens<TChannels, Channel.Email, {
    /** Signs in with an address and a password. */
    email: Door<EmailCredentials, TRefusal> & OtpDoor;
  }>
  & Opens<TChannels, Channel.Phone, {
    /** Signs in with a number and a password. */
    phone: Door<PhoneCredentials, TRefusal> & OtpDoor;
  }>
  & Opens<TChannels, Channel.Google, {
    /** Signs in with an identity token Google issued. */
    google: Door<SocialCredentials, TRefusal>;
  }>
  & Opens<TChannels, Channel.Apple, {
    /** Signs in with an identity token Apple issued. */
    apple: Door<SocialCredentials, TRefusal>;
  }>;

// deno-lint-ignore no-explicit-any
type AnyDoor = SignInDoor<any, any, any>;

function opened(door: AnyDoor): (input: never) => unknown {
  const run = (input: never) => door.run(input);
  const challenge = door.challenge;

  if (challenge !== null) {
    Object.assign(run, {
      resend: (pendingToken: string) => challenge.resend(pendingToken),
      verify: (pendingToken: string, code: string) => challenge.verify(pendingToken, code),
    });
  }

  return run;
}

/** Builds the doors a declaration named, and nothing else. */
export function signInSurface<TChannels extends readonly Channel[], TAccount, TRefusal>(
  target: SignInTarget<TAccount, TRefusal>,
  channels: TChannels,
): SignInSurface<TChannels, TRefusal> {
  const surface: Record<string, (input: never) => unknown> = {};

  for (const channel of channels) {
    switch (channel) {
      case Channel.Email:
        surface.email = opened(new SignInDoor(target, new EmailCredential()));
        break;
      case Channel.Phone:
        surface.phone = opened(new SignInDoor(target, new PhoneCredential()));
        break;
      case Channel.Google:
        surface.google = opened(new SignInDoor(target, new SocialCredential(Channel.Google)));
        break;
      case Channel.Apple:
        surface.apple = opened(new SignInDoor(target, new SocialCredential(Channel.Apple)));
        break;
    }
  }

  return surface as SignInSurface<TChannels, TRefusal>;
}
