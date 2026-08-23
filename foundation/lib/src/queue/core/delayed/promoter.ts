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

import { kv } from "@scribe/foundation/lib/src/redis/mod.ts";
import { runPooled } from "@scribe/alchemy";
import { topology } from "../topology/topology.ts";
import { encode } from "../wire.ts";
import { decodeMember, DELAYED_KEY, type DelayedMember } from "./member.ts";

const PROMOTE_BATCH = 500;
const PROMOTE_CONCURRENCY = 16;

/**
 * Publishes every delayed job whose due date has passed, and answers how many went out.
 *
 * The order is publish then remove, never the reverse: a crash between the two leaves a job
 * duplicated rather than lost, which is the side the at-least-once contract already sits on.
 */
export async function promoteDue(): Promise<number> {
  const due = await dueMembers();
  if (due.length === 0) return 0;

  let promoted = 0;
  await runPooled(due, PROMOTE_CONCURRENCY, async (raw) => {
    if (await promote(raw)) promoted++;
  });

  return promoted;
}

/** The delayed members whose due date has passed, at most {@link PROMOTE_BATCH} of them. */
async function dueMembers(): Promise<string[]> {
  try {
    return await kv().zrangebyscore(
      DELAYED_KEY,
      "-inf",
      Date.now(),
      "LIMIT",
      0,
      PROMOTE_BATCH,
    );
  } catch (error) {
    console.error("[queue] could not read the delayed set:", error);
    return [];
  }
}

/** Publishes one delayed member and forgets it, answering whether it moved. */
async function promote(raw: string): Promise<boolean> {
  const member = decodeMember(raw);
  if (member === null) {
    console.error("[queue] dropping an unreadable delayed member:", raw);
    await forget(raw, "unknown");
    return false;
  }

  try {
    await publish(member);
  } catch (error) {
    console.error(
      `[queue] could not promote a delayed job of "${member.queue}":`,
      error,
    );
    return false;
  }

  await forget(raw, member.queue);
  return true;
}

/**
 * Publishes a due member on its queue's subject.
 *
 * The message id lets JetStream drop a duplicate on its own when two replicas promote the same
 * member inside the stream's duplicate window.
 */
function publish(member: DelayedMember): Promise<string> {
  return topology.publish(
    member.subject,
    encode({ data: member.data }),
    `${member.queue}:${member.id}`,
  );
}

async function forget(raw: string, queue: string): Promise<void> {
  try {
    await kv().zrem(DELAYED_KEY, raw);
  } catch (error) {
    console.error(
      `[queue] promoted a delayed job of "${queue}" but could not remove it, it will run again:`,
      error,
    );
  }
}
