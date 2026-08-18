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

import { kv } from "@scribe/foundation/src/redis/mod.ts";
import { lockCommands } from "./release_script.ts";

/**
 * How long a lock survives its holder.
 *
 * It bounds the damage a replica that dies mid-computation does: the key expires on its own
 * and the next reader gets its turn, rather than the entry staying uncomputable forever.
 */
export const LOCK_TTL_MS = 5_000;

/**
 * What came of trying to take a lock.
 *
 * `held` and `error` are kept apart because they call for opposite reactions: someone else
 * is computing, so wait — against Redis is unreachable, so stop coordinating and compute.
 */
export type LockOutcome =
  | { readonly state: "acquired"; readonly token: string }
  | { readonly state: "held" }
  | { readonly state: "error" };

/** Reports a lock operation that failed, so the caller can degrade instead of throw. */
export type LockErrorReporter = (operation: string, error: unknown) => void;

/**
 * A lock one replica of a fleet holds while it computes an entry.
 *
 * The token is what makes releasing safe. A holder that overran {@link LOCK_TTL_MS} no
 * longer owns the key — another replica may have taken it — so releasing by key alone would
 * free a lock somebody else is relying on. See {@link lockCommands} for how the comparison
 * and the removal are made atomic.
 */
export class DistributedLock {
  readonly #onError: LockErrorReporter;

  constructor(onError: LockErrorReporter) {
    this.#onError = onError;
  }

  /** Takes the lock if it is free, and says which of the three things happened. */
  async acquire(lockKey: string): Promise<LockOutcome> {
    const token = crypto.randomUUID();

    try {
      const claimed = await kv().set(lockKey, token, "PX", LOCK_TTL_MS, "NX");
      return claimed === "OK" ? { state: "acquired", token } : { state: "held" };
    } catch (error) {
      this.#onError("lock", error);
      return { state: "error" };
    }
  }

  /** Releases the lock, and does nothing when this token no longer owns it. */
  async release(lockKey: string, token: string): Promise<void> {
    try {
      await lockCommands().releaseLock(lockKey, token);
    } catch (error) {
      this.#onError("unlock", error);
    }
  }
}
