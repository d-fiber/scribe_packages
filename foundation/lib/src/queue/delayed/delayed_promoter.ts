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
import { DateTime, type Future, runPooled } from "@scribe/alchemy";
import { log } from "@scribe/alchemy/observe";
import { topology } from "../topology/topology.ts";
import { encode } from "../wire_message.ts";
import { decodeMember, DELAYED_KEY, type DelayedMember } from "./delayed_member.ts";

const PROMOTE_BATCH = 500;
const PROMOTE_CONCURRENCY = 16;

/**
 * Publishes every delayed job whose due date has passed, and answers how many went out.
 *
 * The order is publish then remove, never the reverse: a crash between the two leaves a job
 * duplicated rather than lost, which is the side the at-least-once contract already sits on.
 *
 * @remarks
 * Every member this pass is done with, published or unreadable, is removed with one `ZREM`
 * carrying the whole list rather than one call per member. A member whose publish failed is left
 * out and stays in the set for the next pass to retry.
 */
export async function promoteDue(): Future<number> {
  const due = await dueMembers();
  if (due.length === 0) return 0;

  const toDrop: string[] = [];
  const published: string[] = [];

  await runPooled(due, PROMOTE_CONCURRENCY, async (raw) => {
    const member = decodeMember(raw);
    if (member === null) {
      log.error("queue.delayed_member_unreadable", {
        metadata: { member: raw, consequence: "the member is dropped" },
      });
      toDrop.push(raw);
      return;
    }

    try {
      await publish(member);
    } catch (error) {
      log.error("queue.promote_failed", {
        metadata: { queue: member.queue, error },
      });
      return;
    }

    published.push(raw);
  });

  if (toDrop.length > 0) await forgetAll(toDrop);
  return published.length === 0 ? 0 : await forgetAll(published);
}

/** The delayed members whose due date has passed, at most {@link PROMOTE_BATCH} of them. */
async function dueMembers(): Future<string[]> {
  try {
    return await kv().zrangebyscore(
      DELAYED_KEY,
      "-inf",
      DateTime.now().millisecondsSinceEpoch,
      "LIMIT",
      0,
      PROMOTE_BATCH,
    );
  } catch (error) {
    log.error("queue.delayed_read_failed", { metadata: { error } });
    return [];
  }
}

/**
 * Publishes a due member on its queue's subject.
 *
 * The message id lets JetStream drop a duplicate on its own when two replicas promote the same
 * member inside the stream's duplicate window.
 */
function publish(member: DelayedMember): Future<string> {
  return topology.publish(
    member.subject,
    encode({ data: member.data }),
    `${member.queue}:${member.id}`,
  );
}

/**
 * Takes every member of `raws` out of the delayed set in one round trip, answering how many of
 * them this call is what removed.
 *
 * @remarks
 * What decides that is the removal and not the publication. Two passes running at once both see
 * a member as due and both publish it, which the stream's duplicate window absorbs, but only one
 * of them takes it out of the set. `ZREM` answers exactly that count on its own, so it is read
 * straight through rather than compared per member the way a loop of individual removals had to.
 */
async function forgetAll(raws: readonly string[]): Future<number> {
  try {
    return await kv().zrem(DELAYED_KEY, ...raws);
  } catch (error) {
    log.error("queue.promoted_not_forgotten", {
      metadata: {
        count: raws.length,
        consequence: "these jobs will run again",
        error,
      },
    });
    return 0;
  }
}
