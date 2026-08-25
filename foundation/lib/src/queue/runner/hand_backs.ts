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

import { kv } from "../../redis/kv.ts";
import type { Future } from "@scribe/alchemy";
import { log } from "@scribe/alchemy/observe";
import type { JsMsg } from "@nats-io/jetstream";

/**
 * How long a hand-back is remembered.
 *
 * @remarks
 * Longer than any retry schedule a queue can declare, so the count is still there when the
 * replica that declares the subject finally decides whether the message is spent. Shorter than
 * for ever, because nothing removes it once the message is answered on a path that is not the
 * dead letter.
 */
const REMEMBERED_FOR_SECONDS = 86_400;

/**
 * Records that this process was handed a message for a subject it does not declare.
 *
 * @remarks
 * The server counts deliveries and knows nothing of who they went to. A replica that does not
 * declare a subject hands its messages back, and each hand-back is a delivery the body of the
 * declaring replica never saw. Read as attempts, a job entitled to three tries is buried after
 * one, and the more replicas a deployment runs the sooner it happens.
 *
 * Nothing here throws. A count that could not be written reads as no hand-back, which is what
 * the deployment did before this existed.
 */
export async function noteHandBack(message: JsMsg): Future<void> {
  const key = _keyOf(message);

  try {
    await kv().incr(key);
    await kv().expire(key, REMEMBERED_FOR_SECONDS);
  } catch (error) {
    log.error("queue.hand_back_uncounted", {
      metadata: { key, consequence: "the delivery is read as an attempt of the body", error },
    });
  }
}

/**
 * How many of a message's deliveries were hand-backs rather than attempts of a body.
 *
 * @remarks
 * Read only where it changes an answer, which is the moment a message would otherwise be given
 * up on. Every other failure pays nothing for this.
 */
export async function handBacksFor(message: JsMsg): Future<number> {
  try {
    const held = await kv().get(_keyOf(message));
    const counted = Number(held);
    return Number.isFinite(counted) && counted > 0 ? counted : 0;
  } catch {
    return 0;
  }
}

/** Forgets what was counted for a message nothing will deliver again. */
export async function forgetHandBacks(message: JsMsg): Future<void> {
  try {
    await kv().del(_keyOf(message));
  } catch {
    return;
  }
}

/** The key one message's hand-backs are counted under. */
function _keyOf(message: JsMsg): string {
  return `q:handback:${message.subject}:${message.seq}`;
}
