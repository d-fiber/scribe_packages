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
import { checkCaller } from "@scribe/core/runtime/http/caller.ts";
import { sha256Hex } from "@scribe/core/runtime/support/crypto/hash.ts";
import { RateLimit } from "@scribe/foundation/src/rate_limit/mod.ts";
import { devices } from "./devices/devices.ts";
import { goTrue } from "./gotrue/gotrue_client.ts";
import { AccountRevocation } from "./revocation.ts";
import { AuthValidator } from "./validator.ts";
import { identifiersOf } from "./identity.ts";

/** Why a password could not be changed. */
export enum PasswordError {
  /** The two copies of the new password are not the same. */
  PasswordsDoNotMatch = "passwords_do_not_match",

  /** The new password is the one already in force. */
  SameAsCurrentPassword = "same_as_current_password",

  /** The new password is too weak for what the identity provider accepts. */
  InvalidPassword = "invalid_password",

  /** The current password is not the one in force. */
  InvalidCurrentPassword = "invalid_current_password",

  /** The caller, or the account it is aiming at, has been tried too often. */
  TooManyRequests = "too_many_requests",

  /** Something failed that the caller can do nothing about. */
  Unexpected = "unexpected",
}

/** Whether the password changed, and what stopped it when it did not. */
export type PasswordResult = Result<void, PasswordError>;

const CALLER = new RateLimit({
  key: "account:password",
  limit: 10,
  window: Time.minutes(1),
  penalty: Time.minutes(1),
  maxPenalty: Time.minutes(30),
  failOpen: false,
});

const TARGET = new RateLimit({
  key: "account:password:of",
  limit: 5,
  window: Time.minutes(15),
  penalty: Time.minutes(15),
  maxPenalty: Time.minutes(15),
  failOpen: false,
});

async function held(id: string): Promise<PasswordError | null> {
  const caller = await checkCaller(CALLER);
  if (!caller.ok) return PasswordError.TooManyRequests;

  const target = await TARGET.check("", await sha256Hex(id));
  return target.ok ? null : PasswordError.TooManyRequests;
}

async function write(id: string, password: string, accessToken: string | null): Promise<PasswordResult> {
  const written = await goTrue.user.password.update(id, password);
  if (!written.ok) return new Failure(PasswordError.Unexpected);

  await AccountRevocation.sessions(id, accessToken);
  await devices.kickAll(id);

  return new OK();
}

/**
 * The password of an account, and the two ways it changes.
 *
 * Both end the same way: every session goes and every device is thrown out. A password changed
 * while the old sessions keep working protects nobody, since the reason to change one is usually
 * that somebody else has it.
 */
export class AccountPassword {
  /**
   * Changes the password of someone who can produce the current one.
   *
   * The current password is checked by signing in with it, which is the only way to ask the
   * identity provider whether it is right. That mints a session, and the session is revoked on
   * every path out, including the one where the change succeeds.
   */
  async update(id: string, current: string, next: string, confirmation: string): Promise<PasswordResult> {
    const refusal = await held(id);
    if (refusal !== null) return new Failure(refusal);

    if (next !== confirmation) return new Failure(PasswordError.PasswordsDoNotMatch);
    if (current === next) return new Failure(PasswordError.SameAsCurrentPassword);
    if (!AuthValidator.password.isValid(next)) return new Failure(PasswordError.InvalidPassword);

    const identifiers = await identifiersOf(id);
    if (identifiers === null) return new Failure(PasswordError.Unexpected);

    const proof = identifiers.email
      ? await goTrue.signIn.email.withPassword(identifiers.email, current)
      : identifiers.phone
      ? await goTrue.signIn.phone.withPassword(identifiers.phone, current)
      : null;

    if (!proof?.ok) return new Failure(PasswordError.InvalidCurrentPassword);

    const accessToken = proof.data.access_token ?? null;
    let revoked = false;

    try {
      const written = await write(id, next, accessToken);
      revoked = written.ok;
      return written;
    } finally {
      if (!revoked && accessToken) await AccountRevocation.session(accessToken);
    }
  }

  /**
   * Sets a password without asking for the current one, which only a proven reset may do.
   *
   * Nothing here checks that the caller earned the right to do it. The pending token is what
   * proves that, and it is spent before this is reached.
   */
  async reset(id: string, next: string, confirmation: string): Promise<PasswordResult> {
    const refusal = await held(id);
    if (refusal !== null) return new Failure(refusal);

    if (next !== confirmation) return new Failure(PasswordError.PasswordsDoNotMatch);
    if (!AuthValidator.password.isValid(next)) return new Failure(PasswordError.InvalidPassword);

    return await write(id, next, null);
  }
}

/** The password of every account. */
export const accountPassword: AccountPassword = new AccountPassword();
