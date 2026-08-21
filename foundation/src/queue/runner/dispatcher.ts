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

import { queueRegistry } from "@scribe/foundation/src/queue/core/registry.ts";
import type { JsMsg } from "@nats-io/jetstream";
import type { DrainTally } from "./drain_tally.ts";
import { processorFor } from "./processing/processor_factory.ts";

function groupBySubject(
  messages: readonly JsMsg[],
): ReadonlyMap<string, JsMsg[]> {
  const groups = new Map<string, JsMsg[]>();
  for (const message of messages) {
    const group = groups.get(message.subject);
    if (group) group.push(message);
    else groups.set(message.subject, [message]);
  }
  return groups;
}

/**
 * Hands a mixed batch to the right body, one group per subject.
 *
 * The shared consumer returns whatever was waiting, from any queue, so the batch has to be
 * split before anything can run. The groups are handled in parallel: a pass then lasts as
 * long as its slowest group rather than the sum of them.
 */
export class MessageDispatcher {
  async dispatch(
    messages: readonly JsMsg[],
    tally: DrainTally,
  ): Promise<void> {
    if (messages.length === 0) return;

    await Promise.all(
      [...groupBySubject(messages)].map(([subject, group]) => this.#dispatchGroup(subject, group, tally)),
    );
  }

  #dispatchGroup(
    subject: string,
    group: readonly JsMsg[],
    tally: DrainTally,
  ): Promise<void> {
    const queue = queueRegistry.bySubject(subject);
    if (!queue) {
      console.error(
        `[queue] no queue declared for subject "${subject}", ${group.length} message(s) discarded`,
      );
      for (const message of group) message.term();
      return Promise.resolve();
    }

    return processorFor(queue).process(group, tally);
  }
}
