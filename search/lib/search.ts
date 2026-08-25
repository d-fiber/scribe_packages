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

/**
 * What "search" hands whoever mounts it.
 *
 * @remarks
 * Everything it is made of lives in `src/`, the types it publishes in `contracts/`, and this is
 * the one file that names them: a file no line below reaches is a file this package does not
 * publish.
 *
 * `scribe` at the bottom is the other half of what it hands over. It is the three moments the
 * host may run this package at, and a package that runs at none of them says so with an empty
 * one rather than by exporting nothing.
 */

import type { LifecycleSteps } from "@scribe/alchemy";
import { extensions, OptionalExtension, runDeclarations } from "@scribe/runtime/support/extensions/mod.ts";
import { required } from "@scribe/foundation";
import { SEARCH_EXTENSION } from "./src/core/extension.ts";
import { syncDeclaredIndices } from "./src/db/indices.ts";
import { searchSettings } from "./src/settings.ts";
import { OpenSearchTransport } from "./src/transport/opensearch.ts";
import { SearchTransports } from "./src/transport/registry.ts";

export { Search } from "./src/core/search.ts";
export type {
  DeclaredSorts,
  DocumentStep,
  IndexOptions,
  PreviewStep,
  PropertiesOf,
  QueryContext,
  QueryStep,
} from "./src/core/search.ts";
export { SearchIndex } from "./src/core/search_index.ts";
export { declaredIndices, indexNamed } from "./src/core/registry.ts";
export type { AnySearchIndex } from "./src/core/registry.ts";
export { SEARCH_EXTENSION } from "./src/core/extension.ts";
export { digest, roundCoord, stableKey, timeBucket } from "./src/core/cache_key.ts";

export { Field } from "./src/fields/mapping.ts";
export { DEFAULT_SETTINGS, SORT_NORMALIZER } from "./src/fields/mapping.ts";
export type { DocumentShape, EmbedOptions, FieldOptions, TextOptions } from "./src/fields/mapping.ts";
export { DateMath, Distance, Fuzziness, Geo } from "./src/fields/value.ts";
export { QueryBuilder } from "./src/fields/query.ts";
export type { QueryFields } from "./src/fields/projection.ts";
export type { PreviewOf, PreviewShape } from "./src/document/selector.ts";

export { SearchTransports } from "./src/transport/registry.ts";
export { OpenSearchTransport } from "./src/transport/opensearch.ts";

export { syncDeclaredIndices } from "./src/db/indices.ts";
export { backlog } from "./src/db/outbox.ts";
export type { SearchBacklog } from "./src/db/outbox.ts";
export type { SearchIndexRow, SearchOutboxRow, SearchSourceRow } from "./src/db/tables.ts";

export { drainSearchOutbox, searchDrain } from "./src/sync/drain.ts";

/**
 * When this package runs: the cluster at import, the mappings once the database answers.
 *
 * @remarks
 * The settings are where this package reaches the cluster, read from the process environment, and
 * the transport is what answers a query once they are filled. Neither needs anything running.
 *
 * The extension is where the project's own declarations are loaded from, on the first drain that
 * needs them. A declaration lives in the project, and the drain runs in a process that has no
 * reason to have imported it, so registering it here is what makes an index findable by name in a
 * worker that only ever handled queue work. The drain's own cron job is registered by the line
 * that publishes `searchDrain` above, since a re-export evaluates the file it names.
 *
 * The indices cannot be wired at import: a declaration lives at module scope and is evaluated
 * before anything is connected, so the mapping it asks for is written after boot.
 */
export const scribe: LifecycleSteps = {
  wires: () => {
    searchSettings.use({ clusterUrl: required("OPENSEARCH_URL") });
    SearchTransports.use(new OpenSearchTransport());

    if (!extensions.declares(SEARCH_EXTENSION)) {
      extensions.register(new OptionalExtension(SEARCH_EXTENSION, () => runDeclarations("searchers")));
    }
  },
  starts: () => syncDeclaredIndices(),
};
