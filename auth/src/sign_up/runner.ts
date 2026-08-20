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

import { Time } from "@scribe/core/contracts/common/time.ts";
import { Failure, OK, type Result } from "@scribe/core/contracts/result.ts";
import { requestDevice } from "@scribe/core/runtime/device/device.ts";
import { checkCaller } from "@scribe/core/runtime/http/caller.ts";
import { RateLimit } from "@scribe/foundation/src/rate_limit/mod.ts";
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

function callerLimit(role: string, channel: Channel): RateLimit {
  return new RateLimit({
    key: `sign-up:${role}:${channel}`,
    limit: 5,
    window: Time.minutes(15),
    penalty: Time.minutes(15),
    maxPenalty: Time.hours(1),
    failOpen: false,
  });
}

function recipientLimit(role: string, channel: Channel): RateLimit {
  return new RateLimit({
    key: `sign-up:${role}:${channel}:to`,
    limit: 3,
    window: Time.minutes(15),
    penalty: Time.minutes(15),
    maxPenalty: Time.minutes(15),
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
  readonly #caller: RateLimit;
  readonly #recipient: RateLimit;

  constructor(target: SignUpTarget<TSignUp>, credential: SignUpCredential<TInput>) {
    this.#target = target;
    this.#credential = credential;
    this.#caller = callerLimit(target.name, credential.channel);
    this.#recipient = recipientLimit(target.name, credential.channel);
  }

  /** Creates the account, or answers what stopped it. */
  async run(input: TInput & WriteOf<TSignUp>): Promise<SignUpResult<SignUpError>> {
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

    return new OK({ device_token: token });
  }

  async #undo(id: string): Promise<void> {
    await this.#target.forget(id);
    await goTrue.user.delete(id);
  }
}
