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

import { Duration, type Future, type UnmodifiableList } from "@scribe/alchemy";
import { log } from "@scribe/alchemy/observe";
import { noteHandBack } from "./hand_backs.ts";
import { queueRegistry } from "@scribe/foundation/lib/src/queue/queue_registry.ts";
import type { JsMsg } from "@nats-io/jetstream";
import type { DrainTally } from "./drain_tally.ts";
import { processorFor } from "./processor_for.ts";

/**
 * How long a message for a subject this process does not know waits before it is offered again.
 *
 * @remarks
 * Long enough that a process which will never know the subject does not spin on it, short enough
 * that a replica which does know is not kept waiting for work it could be doing.
 */
const HAND_BACK_AFTER: Duration = Duration.seconds(30);

function groupBySubject(
  messages: UnmodifiableList<JsMsg>,
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
    messages: UnmodifiableList<JsMsg>,
    tally: DrainTally,
  ): Future<void> {
    if (messages.length === 0) return;

    await Promise.all(
      [...groupBySubject(messages)].map(([subject, group]) => this.#dispatchGroup(subject, group, tally)),
    );
  }

  /**
   * Hands a group back for another replica to take, rather than destroying it.
   *
   * @remarks
   * A subject nothing in this process declares is not a subject nobody declares. The stream is
   * shared by every package, and the shared consumer reads all of it, so a process that mounts
   * one package and not another sees the other's messages go by. Ending them here would delete
   * work that belongs to a replica that does know what to do with it, and a rolling deploy runs
   * two such processes side by side on purpose.
   *
   * Answering with a delay rather than nothing at all is what keeps the consumer moving: an
   * unanswered message holds its slot until the server gives up on it, a refused one comes back
   * when somebody asks again.
   *
   * The hand-back is counted as a retry. Counted nowhere, a process refusing every message it was
   * handed answered the same four zeros as a process that was handed nothing, and nothing an
   * operator watches could tell a silent deployment from a busy one.
   */
  #handBack(subject: string, group: UnmodifiableList<JsMsg>, tally: DrainTally): Future<void> {
    log.warn("queue.subject_undeclared", {
      metadata: {
        subject,
        handedBack: group.length,
        reason: "no queue of that subject is declared in this process",
      },
    });

    for (const message of group) message.nak(HAND_BACK_AFTER.inMilliseconds);
    tally.record("retried", group.length);

    return Promise.all(group.map(noteHandBack)).then(() => undefined);
  }

  #dispatchGroup(
    subject: string,
    group: UnmodifiableList<JsMsg>,
    tally: DrainTally,
  ): Future<void> {
    const queue = queueRegistry.bySubject(subject);
    if (!queue) return this.#handBack(subject, group, tally);

    return processorFor(queue).process(group, tally);
  }
}
