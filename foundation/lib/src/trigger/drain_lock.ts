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

import type { Duration, Future } from "@scribe/alchemy";
import { log } from "@scribe/alchemy/observe";
import { kv } from "../redis/kv.ts";

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
  /** Takes the pass if nobody holds it, holding it `heldFor`, and answers whether this replica may drain. */
  async claim(heldFor: Duration): Future<boolean> {
    try {
      const claimed = await kv().set(KEY, "1", "PX", heldFor.inMilliseconds, "NX");
      return claimed === "OK";
    } catch (error) {
      log.error("trigger-runner.lock_unavailable", {
        metadata: { consequence: "this pass is skipped", error },
      });
      return false;
    }
  }
}
