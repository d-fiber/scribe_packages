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
import { Failure, Ok, type Result } from "@scribe/alchemy";
import { requestDevice } from "@scribe/runtime/device/device.ts";
import { checkCaller } from "@scribe/runtime/http/caller.ts";
import { rateLimit } from "@scribe/alchemy";
import type { RateLimiter } from "@scribe/alchemy";
import type { Channel } from "../../contracts/channel.ts";
import type { WriteOf, WriteShape } from "../declaration/columns.ts";
import { devices } from "../devices/devices.ts";
import { goTrue } from "../gotrue/gotrue_client.ts";
import type { SignUpCredential } from "./doors.ts";
import { SignUpError } from "./errors.ts";

/** What a caller gets back once an account exists. */
export interface SignedUp {
  /** The token the client has to keep to be recognised as the same device next time. */
  readonly device_token: string;
}

/** Whether the account was created, and what stopped it when it was not. */
export type SignUpResult<TError> = Result<SignedUp, TError>;

/** What the runner needs from the declaration it writes for. */
export interface SignUpTarget<TSignUp extends WriteShape> {
  /** The name the token will carry, which the identity provider is told about. */
  readonly name: string;

  /** Whether an account of this role serves without proving what it signed up with. */
  readonly autoConfirm: boolean;

  /** Writes the account and every row the declaration names, and undoes them all if one fails. */
  create(
    input: WriteOf<TSignUp>,
    identity: {
      readonly id: string;
      readonly email?: string | null;
      readonly phone?: string | null;
      readonly emailVerified?: boolean;
      readonly phoneVerified?: boolean;
    },
  ): Promise<boolean>;

  /** Removes the account, which is what undoes a sign-up the hook refused. */
  forget(id: string): Promise<void>;
}

function callerLimit(role: string, channel: Channel): RateLimiter {
  return rateLimit({
    key: `sign-up:${role}:${channel}`,
    limit: 5,
    window: Duration.minutes(15),
    penalty: Duration.minutes(15),
    maxPenalty: Duration.hours(1),
    failOpen: false,
  });
}

function recipientLimit(role: string, channel: Channel): RateLimiter {
  return rateLimit({
    key: `sign-up:${role}:${channel}:to`,
    limit: 3,
    window: Duration.minutes(15),
    penalty: Duration.minutes(15),
    maxPenalty: Duration.minutes(15),
    failOpen: false,
  });
}

/**
 * One door of a sign-up, from the credentials a caller sends to the account that comes out.
 *
 * The sequence is the same whichever door it is, which is why there is one of these and not one
 * per channel: read the credentials, hold the caller to a rate, mint the user, stamp the role on
 * it, write the account and everything the declaration names, record the device, and ask the hook
 * whether any of it may stand.
 *
 * @remarks
 * Everything is undone by removing the user at the identity provider, which the account row and
 * every row hanging off it follow by their foreign keys. The one thing that is not undone is a
 * device the client had already registered under another account, which nothing here created.
 */
export class SignUpDoor<TInput, TSignUp extends WriteShape> {
  readonly #target: SignUpTarget<TSignUp>;
  readonly #credential: SignUpCredential<TInput>;
  readonly #caller: RateLimiter;
  readonly #recipient: RateLimiter;

  constructor(
    target: SignUpTarget<TSignUp>,
    credential: SignUpCredential<TInput>,
  ) {
    this.#target = target;
    this.#credential = credential;
    this.#caller = callerLimit(target.name, credential.channel);
    this.#recipient = recipientLimit(target.name, credential.channel);
  }

  /** Creates the account, or answers what stopped it. */
  async run(
    input: TInput & WriteOf<TSignUp>,
  ): Promise<SignUpResult<SignUpError>> {
    const caller = await checkCaller(this.#caller);
    if (!caller.ok) return new Failure(SignUpError.TooManyRequests);

    const read = await this.#credential.read(input);
    if (!read.ok) return new Failure(read.error);

    if (read.data.recipient !== null) {
      const recipient = await this.#recipient.check("", read.data.recipient);
      if (!recipient.ok) return new Failure(SignUpError.TooManyRequests);
    }

    const device = await requestDevice();
    if (!device) return new Failure(SignUpError.Unexpected);

    const issued = await this.#credential.issue(input);
    if (!issued.ok) return new Failure(issued.error);

    const { id, email, phone } = issued.data;
    const proven = this.#target.autoConfirm;

    const stamped = await goTrue.user.role.update(id, this.#target.name);
    if (!stamped.ok) {
      await this.#undo(id);
      return new Failure(SignUpError.Unexpected);
    }

    const written = await this.#target.create(input, {
      id,
      email,
      phone,
      emailVerified: email !== null && proven,
      phoneVerified: phone !== null && proven,
    });
    if (!written) {
      await this.#undo(id);
      return new Failure(SignUpError.Unexpected);
    }

    const token = await devices.register(id);
    if (token === null) {
      await this.#undo(id);
      return new Failure(SignUpError.Unexpected);
    }

    return new Ok({ device_token: token });
  }

  async #undo(id: string): Promise<void> {
    await this.#target.forget(id);
    await goTrue.user.delete(id);
  }
}
