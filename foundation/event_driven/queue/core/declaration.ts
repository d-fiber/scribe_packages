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
import type {
  BatchHandler,
  JobHandler,
  QueueOptions,
} from "@scribe/host/packages/foundation/event_driven/queue/contract.ts";
import { deadSubjectOf, subjectOf } from "./naming.ts";

export const QUEUE_DEFAULTS = {
  maxRetries: 5,
  maxLen: 100_000,
  concurrency: 10,
  retryBackoff: Time.seconds(1),
  retryBackoffMax: Time.minutes(5),
  processingTimeout: Time.minutes(10),
};

export type QueueMode = "immediate" | "batch";

export interface QueueLimits {
  readonly maxRetries: number;
  readonly maxLen: number;
  readonly concurrency: number;
  readonly retryBackoffMs: number;
  readonly retryBackoffMaxMs: number;
  readonly processingTimeoutMs: number;
}

export interface QueueSubjects {
  readonly subject: string;
  readonly deadSubject: string;
}

export interface RegisteredQueue extends QueueLimits, QueueSubjects {
  readonly name: string;
  readonly mode: QueueMode;
  readonly dedicated: boolean;
  readonly lingerMs?: number;
  readonly handler: JobHandler<unknown> | BatchHandler<unknown>;
}

export function subjectsOf(name: string, dedicated: boolean): QueueSubjects {
  return {
    subject: subjectOf(name, dedicated),
    deadSubject: deadSubjectOf(name),
  };
}

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
