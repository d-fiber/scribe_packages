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

import type { CapabilityWiring } from "@scribe/contracts/capability.ts";
import { Cache } from "@scribe/sdk/gen/scribe/packages/foundation/protocol/cache_pb.ts";
import { Database } from "@scribe/sdk/gen/scribe/packages/foundation/protocol/database_pb.ts";
import { Hook } from "@scribe/sdk/gen/scribe/packages/foundation/protocol/hook_pb.ts";
import { Queue } from "@scribe/sdk/gen/scribe/packages/foundation/protocol/queue_pb.ts";
import { cacheDelete, cacheGet, cacheSet } from "../cache/capability.ts";
import { executeQueries, executeQuery } from "../database/capability.ts";
import { hookEmit } from "../hook/capability.ts";
import { queuePush } from "../queue/capability.ts";

/**
 * Answers the procedures a worker calls that this package needs to exist at all: the database,
 * the cache, the queue, and the hook.
 *
 * @remarks
 * `foundation`'s own `wires` calls this unconditionally, unlike every other package's `wireX`,
 * which only runs for a project that chose to mount it: a project cannot leave this package out,
 * so there is no membership to wait for. The four procedures used to be answered directly by the
 * host instead of through a wire like this one, because nothing could be mounted before the
 * database, the cache, the queue and the hook existed. They moved here so the package that owns
 * each one is also the one that answers a worker asking for it, the same seam every other
 * package's capabilities cross.
 *
 * A new procedure joins the package it belongs to first, `database/capability.ts` for a second
 * database method, `cache/capability.ts` for a second cache method, and is wired here in one more
 * line: this file only ever grows by as many lines as procedures are added, never by the logic
 * behind them.
 */
export function wireFoundation(wiring: CapabilityWiring): void {
  wiring.on(Database.method.execute, executeQuery);
  wiring.on(Database.method.executeBatch, executeQueries);
  wiring.on(Cache.method.get, cacheGet);
  wiring.on(Cache.method.set, cacheSet);
  wiring.on(Cache.method.delete, cacheDelete);
  wiring.on(Queue.method.push, queuePush);
  wiring.on(Hook.method.emit, hookEmit);
}
