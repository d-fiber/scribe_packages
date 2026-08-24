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
import { log } from "@scribe/alchemy/observe";
import { kv } from "@scribe/foundation/lib/src/redis/kv.ts";
import { decodeMember, DELAYED_KEY } from "./delayed_member.ts";

const SCAN_PAGE = 500;
const SCAN_MAX = 50_000;

/**
 * How many delayed jobs each queue is holding, and whether the count is complete.
 *
 * `truncated` exists so the answer never lies by omission: a scan that hit its cap, or a
 * Redis that did not answer, reports a lower bound rather than a confident zero.
 */
export interface DelayedCounts {
  /** How many delayed jobs each queue holds, keyed by queue name. A queue with none is absent. */
  readonly counts: Record<string, number>;

  /** Whether {@link counts} is a lower bound rather than the whole picture. */
  readonly truncated: boolean;
}

/**
 * Counts the delayed jobs per queue, up to the scan cap.
 *
 * @remarks
 * The cap counts every member the scan walked past, readable or not. Counting only the readable
 * ones let a set full of members nothing can read be walked end to end whatever its size, which
 * is the one case where the cap was there to stop.
 */
export async function delayedCounts(): Future<DelayedCounts> {
  const counts: Record<string, number> = {};
  let scanned = 0;
  let cursor = "0";

  try {
    do {
      const [next, entries] = await kv().zscan(
        DELAYED_KEY,
        cursor,
        "COUNT",
        SCAN_PAGE,
      );
      cursor = next;

      for (let i = 0; i < entries.length; i += 2) {
        scanned++;

        const member = decodeMember(entries[i]);
        if (member === null) continue;

        counts[member.queue] = (counts[member.queue] ?? 0) + 1;
      }
    } while (cursor !== "0" && scanned < SCAN_MAX);
  } catch (error) {
    log.error("queue.delayed_counts_unavailable", { metadata: { error } });
    return { counts, truncated: true };
  }

  return { counts, truncated: cursor !== "0" };
}
