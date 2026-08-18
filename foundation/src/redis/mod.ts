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

import { cacheSettings } from "@scribe/foundation/src/valkery/settings.ts";
import { Redis } from "ioredis";

/**
 * The client every subject of this package talks to Redis through.
 *
 * It sits at the root of `src/` rather than inside `valkery/` because three subjects share it:
 * the cache, the occurrence lock of `cron`, and the delayed set of `queue`. The framework's rate
 * limiter shares it too, from the other side of the package boundary.
 */
export type Kv = Redis;

let _client: Kv | null = null;

/**
 * The one client this process opens, built on first use.
 *
 * Building it at import would make the url mandatory to import anything that merely touches the
 * cache, tests included.
 */
export function kv(): Kv {
  return (_client ??= new Redis(cacheSettings.get().redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  }));
}
