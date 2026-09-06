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
import { EXTENSION_INIT } from "@scribe/contracts/extensions.ts";
import { extensions } from "@scribe/runtime/support/extensions/mod.ts";
import { initRegistry } from "./init_registry.ts";
import { inits } from "./init_tables.ts";

/**
 * Loads whatever the project declared, then plays each job that has never run before.
 *
 * @remarks
 * Only the dedicated `init` entrypoint calls this, never `ServerRuntime`: that is what keeps a
 * job from racing another `api` replica over the same name, since the container that runs this
 * is always a single instance gated ahead of `api`, `worker` and `rest` by
 * `depends_on: condition: service_completed_successfully`.
 *
 * Jobs run in name order, for a report that reads the same on every boot. A handler that throws
 * stops the loop before recording its own name, and before running whatever came after it: the
 * same fail-closed choice `db-migrate` and `provision` already make, because a container that
 * exits non-zero keeps `api`, `worker` and `rest` from starting against a half-seeded database.
 *
 * @throws {Error} When a handler throws, or when recording a job that ran is refused.
 */
export async function runDeclaredInits(): Future<void> {
  await extensions.load(EXTENSION_INIT);
  console.info(initRegistry.report());

  const jobs = [...initRegistry.list()].sort((a, b) => a.name.localeCompare(b.name));
  if (jobs.length === 0) return;

  const already = new Set(
    (await inits().select((i) => ({ name: i.name })).get()).map((row) => row.name),
  );

  for (const job of jobs) {
    if (already.has(job.name)) {
      console.info(`[init] ${job.name}, already run`);
      continue;
    }

    console.info(`[init] running ${job.name}`);
    await job.handler();

    const tracked = await inits().insertOne({ name: job.name });
    if (!tracked.ok) {
      throw new Error(`[init] "${job.name}" ran, but recording it failed: ${JSON.stringify(tracked.error)}`);
    }
  }

  console.info("[init] done");
}
