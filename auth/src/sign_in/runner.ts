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

import type { Session } from "@scribe/core/contracts/account.ts";
import { Duration } from "@scribe/alchemy";
import type { IpLocation } from "@scribe/alchemy/route";
import type { RequestDevice } from "@scribe/core/contracts/device.ts";
import { Failure, Ok, type Result } from "@scribe/alchemy";
import { requestDevice } from "@scribe/core/runtime/device/device.ts";
import { currentLocation } from "@scribe/core/runtime/http/accessors/location.ts";
import { callerBlocked, checkCaller } from "@scribe/core/runtime/http/caller.ts";
import { sha256Hex } from "@scribe/core/runtime/support/crypto/hash.ts";
import { RateLimit } from "@scribe/foundation/lib/src/rate_limit/mod.ts";
import type { Channel } from "../../contracts/channel.ts";
import { devices } from "../devices/devices.ts";
import { AccountRevocation } from "../revocation.ts";
import type { SignInCredential } from "./doors.ts";
import { OtpError, SignInError } from "./errors.ts";
import { OtpChallenge, type OtpStarted } from "./otp.ts";

/** The session a sign-in issues, with the token the client has to keep for its device. */
export type SignedInSession = Session & {
  /** The token the client keeps to be recognised as the same device next time. */
  readonly device_token: string;
};

/** What a sign-in answers with: a session, or the challenge that stands between it and one. */
export type SignedIn = SignedInSession | OtpStarted;

/** What the runner needs from the declaration it signs in for. */
export interface SignInTarget<TAccount, TRefusal> {
  /** The name a token has to carry for this door to open. */
  readonly name: string;

  /** The account as this role reads it, or null when no account of this role has that identifier. */
  get(id: string): Promise<TAccount | null>;

  /** Whether this account may open a session right now, ban and declared condition included. */
  admits(
    account: TAccount,
    device: RequestDevice,
    location: IpLocation,
    channel: Channel,
  ): Promise<Result<void, TRefusal>>;
}

function callerLimit(role: string, channel: Channel): RateLimit {
  return new RateLimit({
    key: `sign-in:${role}:${channel}`,
    limit: 10,
    window: Duration.minutes(1),
    penalty: Duration.minutes(1),
    maxPenalty: Duration.minutes(10),
    failOpen: false,
  });
}

function recipientLimit(role: string, channel: Channel): RateLimit {
  return new RateLimit({
    key: `sign-in:${role}:${channel}:to`,
    limit: 10,
    window: Duration.minutes(15),
    penalty: Duration.minutes(15),
    maxPenalty: Duration.hours(24),
    failOpen: false,
  });
}

/**
 * One door of a sign-in, from the credentials a caller sends to the session it gets.
 *
 * A device nobody has seen before does not get a session: it gets a challenge, and the code that
 * ends it is what proves the holder is there. A device already trusted skips straight through,
 * which is why the trust window is short.
 *
 * @remarks
 * The session the provider issues is revoked on every path that does not return it. Without that,
 * a caller whose role was wrong, whose account was banned or whose device was unknown would walk
 * away holding a perfectly valid token for the account it just failed to sign into.
 */
export class SignInDoor<TInput, TAccount, TRefusal> {
  readonly #target: SignInTarget<TAccount, TRefusal>;
  readonly #credential: SignInCredential<TInput>;
  readonly #challenge: OtpChallenge | null;
  readonly #caller: RateLimit;
  readonly #recipient: RateLimit;

  constructor(target: SignInTarget<TAccount, TRefusal>, credential: SignInCredential<TInput>) {
    this.#target = target;
    this.#credential = credential;
    this.#challenge = credential.otp ? new OtpChallenge(target.name, credential.otp) : null;
    this.#caller = callerLimit(target.name, credential.channel);
    this.#recipient = recipientLimit(target.name, credential.channel);
  }

  /** The challenge this door sends codes through, or null when it never sends one. */
  get challenge(): OtpChallenge | null {
    return this.#challenge;
  }

  /** Signs in, or answers the challenge that stands between the caller and a session. */
  async run(input: TInput): Promise<Result<SignedIn, SignInError | TRefusal>> {
    const caller = await checkCaller(this.#caller);
    if (!caller.ok) return new Failure(SignInError.TooManyRequests);

    const read = await this.#credential.read(input);
    if (!read.ok) return new Failure(read.error);

    const recipient = read.data.identifier === null ? null : await sha256Hex(read.data.identifier);
    if (recipient !== null && (await callerBlocked(this.#recipient, recipient))) {
      return new Failure(SignInError.TooManyRequests);
    }

    const authenticated = await this.#credential.authenticate(input, this.#target.name);
    if (!authenticated.ok) {
      if (recipient !== null) await checkCaller(this.#recipient, recipient);
      return new Failure(authenticated.error);
    }

    const { session, role } = authenticated.data;
    const accessToken = session.access_token;
    let keep = false;

    try {
      if (role !== this.#target.name) {
        if (recipient !== null) await checkCaller(this.#recipient, recipient);
        return new Failure(SignInError.InvalidCredentials);
      }

      const device = await requestDevice();
      if (!device) return new Failure(SignInError.Unexpected);

      const account = await this.#target.get(session.user.id);
      if (account === null) return new Failure(SignInError.InvalidCredentials);

      const admitted = await this.#target.admits(
        account,
        device,
        await currentLocation(),
        this.#credential.channel,
      );
      if (!admitted.ok) return new Failure(admitted.error);

      if (this.#challenge !== null && !(await devices.isTrusted(session.user.id, device.device_id))) {
        const started = await this.#challenge.start(read.data.identifier ?? "");
        if (started.ok) return new Ok(started.data);

        return new Failure(
          started.error === OtpError.TooManyRequests ? SignInError.TooManyRequests : SignInError.Unexpected,
        );
      }

      const token = await devices.register(session.user.id);
      if (token === null) return new Failure(SignInError.Unexpected);

      keep = true;
      return new Ok({ ...session, device_token: token });
    } finally {
      if (!keep) await AccountRevocation.session(accessToken);
    }
  }
}
