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
import { Valkery } from "@scribe/foundation/src/valkery/valkery.ts";

const INTENT_TTL = Time.seconds(120);

/** What a code sent by text message was sent for. */
export enum SmsIntent {
  /** The holder asked to set a new password. */
  ResetPassword = "reset-password",

  /** The holder asked to move the account to another number. */
  ChangePhone = "change-phone",
}

/**
 * What the code a number was just sent is meant to do.
 *
 * The identity provider sends the same message in both cases, so nothing in what comes back says
 * which of the two the holder asked for. The mark laid when the code goes out is what the
 * verification reads, and it is consumed on the way so a second verification cannot reuse it.
 */
class SmsIntentStore {
  readonly #cache = new Valkery<SmsIntent>({ key: "sms-intent", ttl: INTENT_TTL });

  /** Records what the code just sent to `phone` is for. */
  mark(phone: string, intent: SmsIntent): Promise<void> {
    return this.#cache.add(phone, intent);
  }

  /** Reads what the last code sent to `phone` was for, and forgets it. */
  async consume(phone: string): Promise<SmsIntent | null> {
    const intent = await this.#cache.get(phone);
    if (intent === null) return null;

    await this.#cache.delete(phone);
    return intent;
  }
}

/** What the code a number was just sent is meant to do, for the two minutes it stays valid. */
export const smsIntent: SmsIntentStore = new SmsIntentStore();
