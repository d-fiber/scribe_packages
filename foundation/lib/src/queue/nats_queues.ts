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

import type { Future, Queue as PortQueue, QueueDriver, QueueMessage, QueueOptions } from "@scribe/alchemy";
import type { UnmodifiableList } from "@scribe/alchemy";
import { Queue } from "./queue.ts";
import type { JobHandler } from "./queue_options.ts";

/**
 * What opens a NATS-backed queue for a package that asked the port for one.
 *
 * @remarks
 * The port promises two members and this package's own `Queue` carries eight, so what is handed
 * back is an adapter and not the class: a caller that reached the port sees what the port
 * declares, and nothing more. The identifier a push answers is dropped here, because the port
 * says a push answers nothing and a driver does not get to promise more than the port it answers.
 *
 * A queue is kept per key, because declaring one twice would take the same NATS subject twice and
 * the second declaration would receive the first one's work.
 *
 * A queue opened without a number of attempts is handed over once, which is what the port says and
 * not what this package's own default says. A declaration that named nothing did not ask for the
 * four retries a job written for this package expects.
 */
export class NatsQueues implements QueueDriver {
  /** The queue `options` names, declared on the first ask and kept from then on. */
  open<T>(options: QueueOptions): PortQueue<T> {
    const declared = this.#declared<T>(options);

    return {
      push: (data: T): Future<void> => declared.push(data).then(() => undefined),
      pushMany: (batch: UnmodifiableList<T>): Future<void> =>
        declared.pushMany(batch).then(() => undefined),
    };
  }

  /**
   * Arms the handler `options` carries, so a runner draining this key calls it.
   *
   * @remarks
   * Declaring the queue is what arms it: the registry a runner reads is filled by the
   * declaration, so there is nothing to start here beyond making sure the declaration exists.
   */
  consume<T>(options: QueueOptions): void {
    this.#declared<T>(options);
  }

  #declared<T>(options: QueueOptions): Queue<T> {
    const held = _opened.get(options.key);
    if (held !== undefined) return held as unknown as Queue<T>;

    const handle = options.handle as ((message: QueueMessage<T>) => void | Future<void>) | undefined;
    const body: JobHandler<T> = handle === undefined
      ? () => Promise.resolve()
      : (_data, message) => Promise.resolve(handle(message));

    const opened = new Queue<T>(
      {
        name: options.key,
        options: {
          maxRetries: options.attempts ?? 1,
          processingTimeout: options.visibility,
        },
      },
      body,
    );

    _opened.set(options.key, opened as unknown as Queue<never>);
    return opened;
  }
}

/**
 * One declaration per key, so asking twice answers the same queue.
 *
 * @remarks
 * It lives beside the class and not inside an instance, because what a declaration writes to is
 * process-global: a host that clears the slot and wires a second driver would meet a registry
 * that already holds the first driver's keys, and every declaration made before the clear would
 * be refused as a duplicate.
 */
const _opened: Map<string, Queue<never>> = new Map();
