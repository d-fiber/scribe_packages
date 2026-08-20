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

import type { Session } from "@scribe/core/contracts/account.ts";
import { Time } from "@scribe/core/contracts/common/time.ts";
import type { RequestIpLocation } from "@scribe/core/contracts/common/location.ts";
import type { RequestDevice } from "@scribe/core/contracts/device.ts";
import { Failure, OK, type Result } from "@scribe/core/contracts/result.ts";
import { requestDevice } from "@scribe/core/runtime/device/device.ts";
import { currentLocation } from "@scribe/core/runtime/http/accessors/location.ts";
import { callerBlocked, checkCaller } from "@scribe/core/runtime/http/caller.ts";
import { sha256Hex } from "@scribe/core/runtime/support/crypto/hash.ts";
import { RateLimit } from "@scribe/foundation/src/rate_limit/mod.ts";
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
    location: RequestIpLocation,
    channel: Channel,
  ): Promise<Result<void, TRefusal>>;
}

function callerLimit(role: string, channel: Channel): RateLimit {
  return new RateLimit({
    key: `sign-in:${role}:${channel}`,
    limit: 10,
    window: Time.minutes(1),
    penalty: Time.minutes(1),
    maxPenalty: Time.minutes(10),
    failOpen: false,
  });
}

function recipientLimit(role: string, channel: Channel): RateLimit {
  return new RateLimit({
    key: `sign-in:${role}:${channel}:to`,
    limit: 10,
    window: Time.minutes(15),
    penalty: Time.minutes(15),
    maxPenalty: Time.hours(24),
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
        if (started.ok) return new OK(started.data);

        return new Failure(
          started.error === OtpError.TooManyRequests ? SignInError.TooManyRequests : SignInError.Unexpected,
        );
      }

      const token = await devices.register(session.user.id);
      if (token === null) return new Failure(SignInError.Unexpected);

      keep = true;
      return new OK({ ...session, device_token: token });
    } finally {
      if (!keep) await AccountRevocation.session(accessToken);
    }
  }
}
