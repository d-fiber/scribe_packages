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

import type {
  BatchHandler,
  JobHandler,
  QueueOptions,
} from "@scribe/foundation/contracts/queue/queue.ts";
import {
  limitsFrom,
  type RegisteredQueue,
  subjectsOf,
} from "./declaration.ts";
import { type Queue, QueueProducer } from "./producer.ts";
import { queueRegistry } from "./registry.ts";

export interface QueueDefinition {
  readonly name: string;
  readonly options?: QueueOptions;
  readonly dedicated?: boolean;
}

export interface BatchQueueDefinition extends QueueDefinition {
  readonly batch: { readonly lingerMs?: number };
}

export function defineQueue<TJob>(
  definition: BatchQueueDefinition,
  handler: BatchHandler<TJob>,
): Queue<TJob>;
export function defineQueue<TJob>(
  definition: QueueDefinition,
  handler: JobHandler<TJob>,
): Queue<TJob>;
export function defineQueue<TJob>(
  definition: QueueDefinition | BatchQueueDefinition,
  handler: JobHandler<TJob> | BatchHandler<TJob>,
): Queue<TJob> {
  const batch = (definition as BatchQueueDefinition).batch;
  const dedicated = definition.dedicated === true;

  const queue: RegisteredQueue = {
    name: definition.name,
    ...subjectsOf(definition.name, dedicated),
    mode: batch ? "batch" : "immediate",
    dedicated,
    lingerMs: batch?.lingerMs,
    handler: handler as JobHandler<unknown> | BatchHandler<unknown>,
    ...limitsFrom(definition.options),
  };

  queueRegistry.add(queue);
  return new QueueProducer<TJob>(queue);
}

export type { Queue };
