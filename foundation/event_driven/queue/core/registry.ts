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

import type { RegisteredQueue } from "./declaration.ts";
import { DEDICATED_STREAM, SHARED_STREAM } from "./naming.ts";

export class QueueRegistry {
  readonly #byName = new Map<string, RegisteredQueue>();
  readonly #bySubject = new Map<string, RegisteredQueue>();

  add(queue: RegisteredQueue): void {
    if (this.#byName.has(queue.name)) {
      throw new Error(
        `defineQueue("${queue.name}"): this name is already declared. A queue ` +
          `name identifies a NATS subject, it must be unique.`,
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

  list(): readonly RegisteredQueue[] {
    return [...this.#byName.values()];
  }

  shared(): readonly RegisteredQueue[] {
    return this.list().filter((queue) => !queue.dedicated);
  }

  dedicated(): readonly RegisteredQueue[] {
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

export const queueRegistry: QueueRegistry = new QueueRegistry();
