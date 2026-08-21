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

import { Time } from "@scribe/core/contracts/common/time.ts";
import type { BatchHandler, JobHandler, QueueOptions } from "@scribe/foundation/lib/contracts/queue/queue.ts";
import { deadSubjectOf, subjectOf } from "./naming.ts";

/** The options a queue gets when its declaration leaves them out. */
export interface QueueDefaults {
  /** Deliveries after which a job goes to the dead letter. */
  readonly maxRetries: number;

  /** How many messages one subject holds before the oldest are dropped. */
  readonly maxLen: number;

  /** How many messages of one queue are handled at once inside a pass. */
  readonly concurrency: number;

  /** The first retry delay; each further attempt doubles it. */
  readonly retryBackoff: Time;

  /** The ceiling the doubling stops at. */
  readonly retryBackoffMax: Time;

  /** How long a handler is given before it is treated as failed. */
  readonly processingTimeout: Time;
}

/** The values a declaration inherits when it leaves an option out. */
export const QUEUE_DEFAULTS: QueueDefaults = {
  maxRetries: 5,
  maxLen: 100_000,
  concurrency: 10,
  retryBackoff: Time.seconds(1),
  retryBackoffMax: Time.minutes(5),
  processingTimeout: Time.minutes(10),
};

/**
 * Whether a handler is called per message or per group.
 *
 * The mode decides the acknowledgement too: a job answers for itself, a batch succeeds or
 * fails whole.
 */
export type QueueMode = "immediate" | "batch";

/** The declaration's numbers, resolved and in milliseconds. */
export interface QueueLimits {
  /** Deliveries after which a job goes to the dead letter. */
  readonly maxRetries: number;

  /** How many messages one subject holds before the oldest are dropped. */
  readonly maxLen: number;

  /** How many messages of this queue are handled at once inside a pass, never below one. */
  readonly concurrency: number;

  /** Milliseconds before the first retry; each further attempt doubles it. */
  readonly retryBackoffMs: number;

  /** The milliseconds the doubling stops at. */
  readonly retryBackoffMaxMs: number;

  /** Milliseconds a handler is given before it is treated as failed. */
  readonly processingTimeoutMs: number;
}

/** The two subjects a queue writes to. */
export interface QueueSubjects {
  /** Where a push lands, and where the consumer reads from. */
  readonly subject: string;

  /** Where a message goes once it has used up its deliveries. */
  readonly deadSubject: string;
}

/** Everything the runner needs about a queue, from its name to its body. */
export interface RegisteredQueue extends QueueLimits, QueueSubjects {
  /** The name the declaration gave, which both subjects are derived from. */
  readonly name: string;

  /** Whether the handler is called per message or per group. */
  readonly mode: QueueMode;

  /** Whether this queue has a stream of its own rather than sharing the common one. */
  readonly dedicated: boolean;

  /**
   * How long a batch waits for more messages before it is handed over, in milliseconds.
   *
   * Only a queue in batch mode carries one. `graceFor()` reads it to widen the fetch window,
   * without which a batch queue would never group anything.
   */
  readonly lingerMs?: number;

  /**
   * The body the declaration armed, which {@link mode} says how to call.
   *
   * The payload type is erased here because the registry holds every queue of the process
   * side by side. The dispatcher puts it back on the way in.
   */
  readonly handler: JobHandler<unknown> | BatchHandler<unknown>;
}

/** Derives both subjects of a queue from its name. */
export function subjectsOf(name: string, dedicated: boolean): QueueSubjects {
  return {
    subject: subjectOf(name, dedicated),
    deadSubject: deadSubjectOf(name),
  };
}

/**
 * Fills a declaration's gaps with the defaults, in milliseconds.
 *
 * Concurrency is floored at one: a limit of zero would give a pool no workers and the
 * messages would never be handled, silently.
 */
export function limitsFrom(options: QueueOptions = {}): QueueLimits {
  return {
    maxRetries: options.maxRetries ?? QUEUE_DEFAULTS.maxRetries,
    maxLen: options.maxLen ?? QUEUE_DEFAULTS.maxLen,
    concurrency: Math.max(1, options.concurrency ?? QUEUE_DEFAULTS.concurrency),
    retryBackoffMs: (options.retryBackoff ?? QUEUE_DEFAULTS.retryBackoff).ms,
    retryBackoffMaxMs: (
      options.retryBackoffMax ?? QUEUE_DEFAULTS.retryBackoffMax
    ).ms,
    processingTimeoutMs: (
      options.processingTimeout ?? QUEUE_DEFAULTS.processingTimeout
    ).ms,
  };
}
