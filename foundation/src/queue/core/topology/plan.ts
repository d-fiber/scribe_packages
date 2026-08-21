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

import { QUEUE_DEFAULTS, type RegisteredQueue } from "../declaration.ts";

/**
 * What the streams and consumers must look like for the declared queues to work.
 *
 * The three streams are shared by every queue, so each number here is the most permissive a
 * declaration asked for: a queue that wants less is not entitled to constrain its neighbours.
 */
export interface TopologyPlan {
  /** How many messages one subject holds before the oldest are dropped. */
  readonly maxPerSubject: number;

  /** Milliseconds the server waits for an acknowledgement before redelivering. */
  readonly ackWaitMs: number;

  /** How many times the server will deliver a message before it stops on its own. */
  readonly maxDeliver: number;

  /** The names of the queues that asked for a stream of their own, sorted. */
  readonly dedicated: readonly string[];
}

/**
 * Derives the plan the declared queues need.
 *
 * `maxDeliver` sits one above the longest retry policy on purpose. The server has to keep
 * delivering for as long as {@link FailurePolicy} intends to retry, or it would stop first
 * and the message would be dropped with nothing but an advisory to show for it, so the dead
 * letter would never be written. The extra delivery covers a replica that dies between
 * receiving the last attempt and answering for it.
 */
export function planFor(queues: readonly RegisteredQueue[]): TopologyPlan {
  return {
    maxPerSubject: Math.max(
      QUEUE_DEFAULTS.maxLen,
      ...queues.map((queue) => queue.maxLen),
    ),
    ackWaitMs: Math.max(
      QUEUE_DEFAULTS.processingTimeout.ms,
      ...queues.map((queue) => queue.processingTimeoutMs),
    ),
    maxDeliver: Math.max(
      QUEUE_DEFAULTS.maxRetries,
      ...queues.map((queue) => queue.maxRetries),
    ) + 1,
    dedicated: queues
      .filter((queue) => queue.dedicated)
      .map((queue) => queue.name)
      .sort(),
  };
}

/** A stable string for a plan, so an unchanged one is not provisioned twice. */
export function planSignature(plan: TopologyPlan): string {
  return [
    plan.maxPerSubject,
    plan.ackWaitMs,
    plan.maxDeliver,
    plan.dedicated.join(","),
  ].join("/");
}
