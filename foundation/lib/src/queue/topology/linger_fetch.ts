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

import { DateTime, type Future } from "@scribe/alchemy";
import type { Consumer, JsMsg } from "@nats-io/jetstream";

/** How long a subject's messages are worth waiting for once the first one has landed. */
export type GraceResolver = (subject: string) => number;

/**
 * Pulls up to `count` messages, and stops early once the grace window has passed.
 *
 * Without the early stop a lone message would wait for the whole window, because the
 * iterator keeps hoping to fill the places it has left, so a welcome email would leave five
 * seconds after its push. The window used is the smallest of the queues present in the
 * batch: a queue that groups must never hold back one that does not.
 */
export async function lingerFetch(
  consumer: Consumer,
  count: number,
  expiresMs: number,
  graceFor?: GraceResolver,
): Future<JsMsg[]> {
  if (count <= 0) return [];

  const iterator = await consumer.fetch({
    max_messages: count,
    expires: expiresMs,
  });

  const messages: JsMsg[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstAt = 0;
  let grace = Number.POSITIVE_INFINITY;

  try {
    for await (const message of iterator) {
      messages.push(message);
      if (!graceFor) continue;

      if (firstAt === 0) firstAt = DateTime.now().millisecondsSinceEpoch;
      grace = Math.min(grace, graceFor(message.subject));

      clearTimeout(timer);
      const remaining = firstAt + grace - DateTime.now().millisecondsSinceEpoch;
      if (remaining <= 0) {
        iterator.stop();
        break;
      }
      timer = setTimeout(() => iterator.stop(), remaining);
    }
  } finally {
    clearTimeout(timer);
  }

  return messages;
}
