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

import type { Future, UnmodifiableList } from "@scribe/alchemy";
import type { RegisteredQueue } from "./queue_declaration.ts";
import type { PushOptions } from "./queue_options.ts";
import type { QueueStatus } from "./queue_status.ts";
import { queueSettings } from "./queue_settings.ts";
import { NatsQueueBackend } from "./nats_queue_backend.ts";
import { SqsQueueBackend } from "./sqs_queue_backend.ts";
import { PubSubQueueBackend } from "./pubsub_queue_backend.ts";

/**
 * What moves a queue's messages, once {@link RegisteredQueue} has decided what they are.
 *
 * @remarks
 * `Queue` and `QueuePublisher` carry the vocabulary a package writes in: a name, a mode, retry
 * and concurrency limits. None of that names a broker. This is the seam where a broker is
 * finally named, and it is named once per process rather than once per queue, because a
 * deployment reads one driver from its settings and every queue declared in it answers to
 * the same one.
 */
export interface QueueBackend {
  /** Publishes `data`, delayed by `opts.delay` when given, and answers the message's own identifier. */
  push<T>(queue: RegisteredQueue, data: T, opts: PushOptions): Future<string>;

  /** Publishes every item of `items`. See {@link DeclaredQueue.pushMany} for what "every" promises. */
  pushMany<T>(queue: RegisteredQueue, items: UnmodifiableList<T>): Future<string[]>;

  /**
   * Resolves `queue` to the opaque address this backend publishes it under: a NATS subject, an
   * SQS queue url, a Pub/Sub topic name.
   *
   * @remarks
   * The one caller is a delayed push: it resolves the address once, while it still has `queue`'s
   * full declaration, and carries it through Redis so the promoter can publish it later without
   * needing this queue declared in whichever replica's pass happens to find it due. See
   * `delayed/delayed_member.ts`'s own doc on `address` for why resolving it again from the name
   * alone at promotion time is not an option.
   */
  addressOf(queue: RegisteredQueue): Future<string>;

  /**
   * Publishes a payload that is already on the wire, to `address`, under `idempotencyKey`.
   *
   * @remarks
   * The one caller is the delayed promoter, with an address {@link addressOf} resolved earlier
   * and a payload already encoded the moment it was parked; re-encoding it here would let the two
   * encodings drift. The key is what a backend that can deduplicate publishes on its own uses to
   * drop a second promotion of the same job; a backend that cannot says so in its own file rather
   * than pretending to honour it.
   */
  publishEncoded(address: string, payload: Uint8Array, idempotencyKey: string): Future<string>;

  /** How many messages of this queue are waiting to be delivered. */
  size(queue: RegisteredQueue): Future<number>;

  /** How many messages of this queue have exhausted their delivery attempts and moved to the dead letter. */
  deadCount(queue: RegisteredQueue): Future<number>;

  /** How many messages of this queue are delayed, waiting for their due date. */
  delayedCount(queue: RegisteredQueue): Future<number>;

  /** This queue's current status: its declaration, and how many messages are pending, dead, or delayed. */
  status(queue: RegisteredQueue): Future<QueueStatus>;

  /**
   * Starts draining every queue registered so far. Does nothing when already draining.
   *
   * @remarks
   * Called once, by the host, after every queue a process will ever declare has been declared:
   * declaring a queue only registers it, so this is the moment its handler can actually start
   * being called.
   */
  startDraining(): void;

  /** Signals every drain loop this backend started to stop after its current pass. */
  stopDraining(): void;
}

let _backend: QueueBackend | null = null;
let _forDriver: string | null = null;

/**
 * The backend this process moves queue messages through, built once from {@link queueSettings}.
 *
 * @remarks
 * Read lazily rather than at import, for the same reason every other driver in this package
 * reads its settings lazily: a queue is declared at module scope, which runs before the host has
 * filled {@link queueSettings}, so resolving here would throw before boot has had a chance to
 * configure anything.
 *
 * Memoized on which driver was configured rather than unconditionally, so a test that reconfigures
 * {@link queueSettings} between cases is not left running the previous case's backend, and so a
 * `stopDraining` call always reaches every loop the matching `startDraining` call started.
 */
export function queueBackend(): QueueBackend {
  const driver = queueSettings.get().driver;
  if (_backend !== null && _forDriver === driver) return _backend;

  _forDriver = driver;
  return (_backend = backendFor(driver));
}

function backendFor(driver: "nats" | "sqs" | "pubsub"): QueueBackend {
  switch (driver) {
    case "nats":
      return new NatsQueueBackend();
    case "sqs":
      return new SqsQueueBackend();
    case "pubsub":
      return new PubSubQueueBackend();
  }
}
