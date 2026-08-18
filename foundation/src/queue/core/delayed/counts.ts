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

import { kv } from "@scribe/core/runtime/redis/mod.ts";
import { DELAYED_KEY, decodeMember } from "./member.ts";

const SCAN_PAGE = 500;
const SCAN_MAX = 50_000;

export interface DelayedCounts {
  readonly counts: Record<string, number>;
  readonly truncated: boolean;
}

export async function delayedCounts(): Promise<DelayedCounts> {
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
        const member = decodeMember(entries[i]);
        if (member === null) continue;

        counts[member.queue] = (counts[member.queue] ?? 0) + 1;
        scanned++;
      }
    } while (cursor !== "0" && scanned < SCAN_MAX);
  } catch (error) {
    console.error("[queue] delayed counts unavailable:", error);
    return { counts, truncated: true };
  }

  return { counts, truncated: cursor !== "0" };
}
