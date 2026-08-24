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

import { DuplicateDeclarationError } from "@scribe/alchemy";
import type { UnmodifiableList } from "@scribe/alchemy";
import type { RegisteredQueue } from "./queue_declaration.ts";
import { DEDICATED_STREAM, SHARED_STREAM } from "./queue_naming.ts";

/**
 * The dispatch table: which declared queue a name, or an arriving subject, belongs to.
 *
 * Indexing by subject as well as by name is what lets the runner take a batch the shared
 * consumer handed it, mixed and from any number of queues, and find each message's body
 * without asking the server anything.
 */
export class QueueRegistry {
  readonly #byName = new Map<string, RegisteredQueue>();
  readonly #bySubject = new Map<string, RegisteredQueue>();

  add(queue: RegisteredQueue): void {
    if (this.#byName.has(queue.name)) {
      throw new DuplicateDeclarationError(
        `new Queue("${queue.name}"): this name is already declared. A queue name identifies a `
          + `NATS subject, it must be unique.`,
      );
    }

    const taken = this.#bySubject.get(queue.subject);
    if (taken !== undefined) {
      throw new DuplicateDeclarationError(
        `new Queue("${queue.name}"): this name reduces to the subject "${queue.subject}", which `
          + `"${taken.name}" already publishes to. Two names that differ only in a character a `
          + "subject token cannot carry are one queue, and the second would take the first's work.",
      );
    }

    this.#byName.set(queue.name, queue);
    this.#bySubject.set(queue.subject, queue);
  }

  get(name: string): RegisteredQueue | null {
    return this.#byName.get(name) ?? null;
  }

  bySubject(subject: string): RegisteredQueue | null {
    return this.#bySubject.get(subject) ?? null;
  }

  list(): UnmodifiableList<RegisteredQueue> {
    return [...this.#byName.values()];
  }

  shared(): UnmodifiableList<RegisteredQueue> {
    return this.list().filter((queue) => !queue.dedicated);
  }

  dedicated(): UnmodifiableList<RegisteredQueue> {
    return this.list().filter((queue) => queue.dedicated);
  }

  report(): string {
    const queues = this.list();
    if (queues.length === 0) return "[queue] no queue declared";

    const dedicated = this.dedicated().length;
    const suffix = dedicated > 0 ? `, ${dedicated} dedicated` : "";
    return `[queue] ${queues.length} declared${suffix} on ${SHARED_STREAM}/${DEDICATED_STREAM}`;
  }
}

/** The registry every declaration writes into, one per process. */
export const queueRegistry: QueueRegistry = new QueueRegistry();
