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
