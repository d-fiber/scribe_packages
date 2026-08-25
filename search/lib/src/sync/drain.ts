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

import { Duration } from "@scribe/alchemy";
import { extensions } from "@scribe/runtime/support/extensions/mod.ts";
import { Cron, every } from "@scribe/foundation/cron";
import { SearchOperation } from "../../contracts/definition.ts";
import { SEARCH_EXTENSION } from "../core/extension.ts";
import type { AnySearchIndex } from "../core/registry.ts";
import { indexNamed } from "../core/registry.ts";
import { claim, fail, settle } from "../db/outbox.ts";
import type { SearchOutboxRow } from "../db/tables.ts";

/**
 * How many batches one occurrence takes before it stops and waits for the next.
 *
 * A backlog is drained inside one occurrence rather than at one batch a minute, which is what
 * a bulk import needs: without it, ten thousand rows written in one go would take an hour to
 * become searchable. The bound is what keeps an occurrence from running until its timeout when
 * something upstream keeps writing faster than the cluster takes.
 */
const MAX_PASSES = 25;

/** What one index has waiting, split by the way its documents move. */
interface Work {
  /** The documents to build from their tables and write. */
  readonly rebuild: string[];

  /** The documents to take out of the index. */
  readonly remove: string[];
}

/**
 * Writes what the outbox holds into the cluster, and answers how many documents left the line.
 *
 * @remarks
 * The project's declarations are loaded first, because the outbox names an index and the
 * process running the drain has no other reason to have imported the file that declares it.
 *
 * A pass that settles nothing stops the drain even when the line is not empty. The rows are
 * claimed oldest first and nothing is locked, so a document the cluster keeps refusing stays
 * at the head of the line: without this the same batch would be tried twenty-five times in a
 * row and the ones behind it would never be reached.
 */
export async function drainSearchOutbox(): Promise<number> {
  await extensions.load(SEARCH_EXTENSION);

  let drained = 0;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const batch = await claim();
    if (batch.length === 0) break;

    const settled = await drainBatch(batch);
    drained += settled;

    if (settled === 0) break;
  }

  return drained;
}

/** Applies one batch, index by index, and answers how many of its rows left the line. */
async function drainBatch(rows: readonly SearchOutboxRow[]): Promise<number> {
  let settled = 0;

  for (const [name, work] of group(rows)) {
    const index = indexNamed(name);

    if (index === null) {
      await fail(name, [...work.rebuild, ...work.remove], `no declaration answers to the index "${name}".`);
      continue;
    }

    settled += await apply(index, work);
  }

  return settled;
}

/**
 * Moves the documents of `work` the way each was queued, and answers how many left the line.
 *
 * What the cluster took is taken out of the line, and what it did not is counted against the
 * row's attempts. A row that runs out of attempts stops being claimed and keeps its reason,
 * which is what someone reads when a document is missing from a search.
 */
async function apply(index: AnySearchIndex, work: Work): Promise<number> {
  const removed = await index.erase(work.remove);
  const rebuilt = await index.rebuild(work.rebuild);

  const handled = new Set([...removed, ...rebuilt]);
  await settle(index.name, [...handled]);

  const left = [...work.remove, ...work.rebuild].filter((id) => !handled.has(id));
  await fail(index.name, left, "the cluster did not take the document.");

  return handled.size;
}

/** The rows of one batch, gathered per index and split by the way their documents move. */
function group(rows: readonly SearchOutboxRow[]): Map<string, Work> {
  const grouped = new Map<string, Work>();

  for (const row of rows) {
    let work = grouped.get(row.index);

    if (work === undefined) {
      work = { rebuild: [], remove: [] };
      grouped.set(row.index, work);
    }

    if (row.operation === SearchOperation.Delete) work.remove.push(row.entity_id);
    else work.rebuild.push(row.entity_id);
  }

  return grouped;
}

/**
 * The job that empties the outbox, armed as soon as this package is mounted.
 *
 * @remarks
 * A minute is the shortest a periodic job runs at, which is the lag a document takes to become
 * searchable after the row it is built from changed. It is the price of indexing outside the
 * transaction, and indexing inside it is the alternative that was not taken: a cluster that
 * answers slowly would then hold the write open, and one that is down would refuse it.
 *
 * It runs as a job rather than as a loop of its own so that a fleet of replicas drains once
 * and not once per replica, which is what the occurrence lock of the runner is for.
 */
export const searchDrain: Cron = new Cron(
  { name: "search-drain", schedule: every(Duration.minutes(1)) },
  async () => {
    await drainSearchOutbox();
  },
);
