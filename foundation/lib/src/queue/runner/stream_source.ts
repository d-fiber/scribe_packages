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

import type { Future } from "@scribe/alchemy";
import {
  DEDICATED_STREAM,
  sanitize,
  SHARED_CONSUMER,
  SHARED_STREAM,
} from "@scribe/foundation/lib/src/queue/queue_naming.ts";
import { topology } from "@scribe/foundation/lib/src/queue/topology/topology.ts";
import type { RegisteredQueue } from "@scribe/foundation/lib/src/queue/queue_declaration.ts";
import type { JsMsg } from "@nats-io/jetstream";
import { graceFor, longestGrace } from "./grace_period.ts";


/**
 * Where one loop reads from: the shared consumer, or a queue's own.
 *
 * Only the shared source promotes the delayed set, because promoting is a process-wide job
 * and every dedicated loop doing it too would multiply the Redis traffic by the number of
 * isolated queues.
 */
export class StreamSource {
  readonly label: string;
  readonly promotesDelayed: boolean;

  readonly #stream: string;
  readonly #durable: string;

  constructor(
    label: string,
    stream: string,
    durable: string,
    promotesDelayed: boolean,
  ) {
    this.label = label;
    this.#stream = stream;
    this.#durable = durable;
    this.promotesDelayed = promotesDelayed;
  }

  static shared(): StreamSource {
    return new StreamSource("shared", SHARED_STREAM, SHARED_CONSUMER, true);
  }

  static dedicated(queue: RegisteredQueue): StreamSource {
    return new StreamSource(
      queue.name,
      DEDICATED_STREAM,
      sanitize(queue.name),
      false,
    );
  }

  static forQueue(queue: RegisteredQueue): StreamSource {
    return queue.dedicated
      ? StreamSource.dedicated(queue)
      : StreamSource.shared();
  }

  /**
   * Pulls at most `count` messages, holding the window open long enough to group them.
   *
   * @remarks
   * The window is the longest linger any declared queue asked for, and never shorter than the
   * constant a queue that groups nothing needs. A fixed window shorter than a declaration closed
   * the iterator first, so a queue that asked to group over half a minute was handed its group
   * early and nothing said the number it declared was not the one applied.
   */
  fetch(count: number): Future<JsMsg[]> {
    return topology.fetch(
      this.#stream,
      this.#durable,
      count,
      longestGrace(),
      graceFor,
    );
  }
}
