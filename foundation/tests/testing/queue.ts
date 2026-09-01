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

import type { QueueMessage } from "@scribe/alchemy";
import { type BatchHandler, type JobHandler, QueuePublisher, type RegisteredQueue } from "../../lib/queue.ts";
import { type InstalledMock, installMock } from "./install.ts";

/** The protected state every `QueuePublisher` carries, reached from outside its class. */
interface QueueInternals {
  readonly queue: RegisteredQueue;
}

/**
 * Stands in for every `Queue` and `QueuePublisher` of the process, so a package that pushes to
 * one can be tested without a NATS connection.
 *
 * A push is delivered to its own queue's handler immediately, in the same call, rather than held
 * for the declaration's own `lingerMs` the way a batch queue really groups its messages: a test
 * wants to see what a push caused, not to drive a fake clock around a grouping window it never
 * asked to verify. A queue declared without `dedicated` still delivers on its own, since this
 * patches every publisher through the one prototype both share.
 */
export function installQueueMock(): InstalledMock {
  const mocks = [
    installMock(
      QueuePublisher.prototype,
      "push",
      async function (this: QueuePublisher<unknown>, data: unknown): Promise<string> {
        const id = crypto.randomUUID();
        await deliverOne(this, id, data);
        return id;
      } as QueuePublisher<unknown>["push"],
    ),
    installMock(
      QueuePublisher.prototype,
      "pushMany",
      async function (this: QueuePublisher<unknown>, items: readonly unknown[]): Promise<string[]> {
        const ids = items.map(() => crypto.randomUUID());
        await deliverGroup(this, items);
        return ids;
      } as QueuePublisher<unknown>["pushMany"],
    ),
  ];

  return {
    restore(): void {
      for (const mock of mocks) mock.restore();
    },
  };
}

function deliverOne(publisher: QueuePublisher<unknown>, id: string, data: unknown): Promise<void> {
  const { mode, handler } = internalsOf(publisher);
  if (mode === "batch") return (handler as BatchHandler<unknown>)([data]);

  const message: QueueMessage<unknown> = { id, data, attempts: 1 };
  return (handler as JobHandler<unknown>)(data, message);
}

function deliverGroup(publisher: QueuePublisher<unknown>, items: readonly unknown[]): Promise<void> {
  const { mode, handler } = internalsOf(publisher);
  if (mode === "batch") return (handler as BatchHandler<unknown>)(items);

  return Promise.all(
    items.map((data) => (handler as JobHandler<unknown>)(data, { id: crypto.randomUUID(), data, attempts: 1 })),
  ).then(() => undefined);
}

function internalsOf(publisher: QueuePublisher<unknown>): RegisteredQueue {
  return (publisher as unknown as QueueInternals).queue;
}
