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

import { sleep } from "@scribe/core/runtime/support/async/sleep.ts";
import { type DistributedLock, LOCK_TTL_MS } from "./lock/distributed_lock.ts";

const POLL_MS = 50;
const MAX_WAIT_MS = LOCK_TTL_MS + 3_000;

export interface CacheSlot<T> {
  read(): Promise<T | null>;
  write(value: T): Promise<void>;
}

export class SingleFlight {
  readonly #lock: DistributedLock;
  readonly #onGaveUp: (id: string) => void;

  constructor(lock: DistributedLock, onGaveUp: (id: string) => void) {
    this.#lock = lock;
    this.#onGaveUp = onGaveUp;
  }

  async run<T>(
    id: string,
    lockKey: string,
    slot: CacheSlot<T>,
    compute: () => Promise<T>,
  ): Promise<T> {
    const deadline = Date.now() + MAX_WAIT_MS;

    while (Date.now() < deadline) {
      const lock = await this.#lock.acquire(lockKey);
      if (lock.state === "error") break;

      if (lock.state === "acquired") {
        try {
          const value = await compute();
          await slot.write(value);
          return value;
        } finally {
          await this.#lock.release(lockKey, lock.token);
        }
      }

      await sleep(POLL_MS);
      const written = await slot.read();
      if (written !== null) return written;
    }

    this.#onGaveUp(id);
    return compute();
  }
}
