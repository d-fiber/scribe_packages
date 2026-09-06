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
import { EXTENSION_RUN } from "@scribe/contracts/extensions.ts";
import { extensions } from "@scribe/runtime/support/extensions/mod.ts";
import { runRegistry } from "./run_registry.ts";

/**
 * Loads whatever the project declared, then plays every job, every time this is called.
 *
 * @remarks
 * Only the dedicated `run` entrypoint calls this, once per launch, after `api`, `worker`, `rest`,
 * `kong` and `caddy` have all answered healthy. Unlike `runDeclaredInits`, nothing here is tracked:
 * there is no "already done" to check, because a `@Run` job is meant to play again on every
 * launch.
 *
 * Jobs run in name order, for a report that reads the same on every launch. A handler that throws
 * stops the loop before running whatever came after it, and the process exits non-zero — nothing
 * downstream depends on this container finishing, so the only consequence is an honest failure
 * reported instead of a silent partial run.
 *
 * @throws {Error} When a handler throws.
 */
export async function runDeclaredRuns(): Future<void> {
  await extensions.load(EXTENSION_RUN);
  console.info(runRegistry.report());

  const jobs = [...runRegistry.list()].sort((a, b) => a.name.localeCompare(b.name));

  for (const job of jobs) {
    console.info(`[run] running ${job.name}`);
    await job.handler();
  }

  console.info("[run] done");
}
