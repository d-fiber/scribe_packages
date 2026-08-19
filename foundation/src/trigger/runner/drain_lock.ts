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

/** The key one pass is claimed under, shared by every replica. */
const KEY = "trigger:drain";

/**
 * Claims one pass over the outbox, for the whole fleet.
 *
 * It is a marker rather than a mutex: it is never released, it expires. Two replicas draining
 * together would publish every change twice, and while JetStream drops the second copy inside
 * its duplicate window, a window that has closed would let both through.
 *
 * An unreachable Redis answers no. A pass that does not happen is taken by the next tick, half
 * a second later, and nothing is lost because a row leaves the table only once published.
 */
export class DrainLock {
  /** Takes the pass if nobody holds it, and answers whether this replica may drain. */
  async claim(holdMs: number): Promise<boolean> {
    try {
      const claimed = await kv().set(KEY, "1", "PX", holdMs, "NX");
      return claimed === "OK";
    } catch (error) {
      console.error("[trigger-runner] lock unavailable, pass skipped:", error);
      return false;
    }
  }
}
