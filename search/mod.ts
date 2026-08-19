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
