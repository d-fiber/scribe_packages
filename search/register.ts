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

import { extensions, OptionalExtension } from "@scribe/core/runtime/support/extensions/mod.ts";
import { Env } from "@scribe/host/env.ts";
import { searchSettings } from "@scribe/search/src/settings.ts";
import { OpenSearchTransport, SEARCH_EXTENSION, SearchTransports, syncDeclaredIndices } from "./mod.ts";

import "./src/sync/drain.ts";

/** Where this module reaches the cluster, from the process environment. */
searchSettings.use({
  clusterUrl: Env.OPENSEARCH_URL,
});

/** What this module hands the framework when it is mounted. */
SearchTransports.use(new OpenSearchTransport());

/**
 * Where the project's own declarations are loaded from, on the first drain that needs them.
 *
 * A declaration lives in the project, and the drain runs in a process that has no reason to
 * have imported it. Registering it here is what makes an index findable by name in a worker
 * that only ever handled queue work.
 *
 * The `sync/drain.ts` import above is for its effect: declaring a cron job registers it, and
 * the runner reads the registry at start.
 */
extensions.register(
  new OptionalExtension(
    SEARCH_EXTENSION,
    () => import("@app/extensions/manifest/search/search.ts"),
  ),
);

/**
 * Makes the cluster hold what every declaration asks for, once the process can reach it.
 *
 * @remarks
 * The transport above is wired at import, because it needs nothing. The indices cannot be: a
 * declaration lives at module scope and is evaluated before anything is connected, so the
 * mapping it needs is written here, where the host calls a mounted module after boot.
 */
export function start(): Promise<void> {
  return syncDeclaredIndices();
}
