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
import { Valkery } from "@scribe/foundation/lib/src/valkery/valkery.ts";

const INTENT_TTL = Duration.seconds(120);

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
