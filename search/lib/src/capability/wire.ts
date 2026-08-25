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

import { Search } from "@scribe/sdk/gen/scribe/packages/search/protocol/search_pb.ts";
import type { CapabilityWiring } from "@scribe/contracts/capability.ts";
import { create } from "@bufbuild/protobuf";
import {
  type QueueRequest,
  type QueueResult,
  QueueResultSchema,
  type SearchRequest,
  type SearchResult,
  SearchResultSchema,
} from "@scribe/sdk/gen/scribe/packages/search/protocol/search_pb.ts";
import { type AnySearchIndex, indexNamed } from "../../search.ts";
import { decodeJson, encodeJson } from "@scribe/sdk";

function failed(scope: string, cause: unknown): { code: string; message: string } {
  const message = cause instanceof Error ? cause.message : String(cause);
  console.error(`[worker-search:${scope}] ${message}`);
  return { code: "search_failed", message };
}

/**
 * The index declared as `name`, or null when this process declared none under it.
 *
 * A declaration lives in the project and is only known to a process that imported it, so a name
 * nothing answers to says the index is unknown here and not that it does not exist.
 */
function declared(name: string): AnySearchIndex | null {
  return name ? indexNamed(name) : null;
}

/**
 * Puts the documents a worker names in line to be rebuilt.
 *
 * @remarks
 * The search package writes the whole request in one call and answers whether the line took it,
 * which is what `queued` carries: a false there is a line that refused the write, not a store
 * that broke. A request naming no document writes nothing and is queued.
 */
export async function searchAdd(request: QueueRequest): Promise<QueueResult> {
  const index = declared(request.index);
  if (!index) return create(QueueResultSchema, { error: failed("add", `no index is declared as "${request.index}"`) });

  try {
    return create(QueueResultSchema, { queued: await index.addMany(request.ids) });
  } catch (cause) {
    return create(QueueResultSchema, { error: failed("add", cause) });
  }
}

/**
 * Puts the documents a worker names in line to be taken out of the index.
 *
 * @remarks
 * The search package removes one document per call, so a request naming several writes as many
 * lines and `queued` is true when every one of them was taken. A line that took only part of the
 * batch leaves the identifiers it refused unqueued, and the false it answers with is what tells
 * the worker to ask again.
 */
export async function searchDelete(request: QueueRequest): Promise<QueueResult> {
  const index = declared(request.index);
  if (!index) {
    return create(QueueResultSchema, { error: failed("delete", `no index is declared as "${request.index}"`) });
  }

  try {
    const queued = await Promise.all(request.ids.map((id) => index.delete(id)));
    return create(QueueResultSchema, { queued: queued.every((taken) => taken) });
  } catch (cause) {
    return create(QueueResultSchema, { error: failed("delete", cause) });
  }
}

/**
 * Answers the page an index gives for the parameters a worker sent.
 *
 * @remarks
 * What travels back is the items of the page and how many documents are known to match, which is
 * the shape the SDK reads. The offset is left out because it is what the caller asked with.
 *
 * A cluster that could not be reached, or a plan it refused, is a failure rather than an empty
 * page: an empty page is an answer, and a caller that cannot tell the two apart shows nothing
 * found where there was an outage.
 */
export async function searchQuery(request: SearchRequest): Promise<SearchResult> {
  const index = declared(request.index);
  if (!index) {
    return create(SearchResultSchema, { error: failed("search", `no index is declared as "${request.index}"`) });
  }

  try {
    const answer = await index.search(decodeJson(request.params) ?? {});
    if (!answer.ok) {
      return create(SearchResultSchema, { error: failed("search", `the index "${request.index}" answered nothing`) });
    }

    return create(SearchResultSchema, {
      page: encodeJson({ items: [...answer.data.items], total: answer.data.total }),
    });
  } catch (cause) {
    return create(SearchResultSchema, { error: failed("search", cause) });
  }
}

/**
 * Answers the three procedures `search.proto` declares.
 *
 * @remarks
 * The host hands the wire over at boot and never names a procedure of this package, so mounting it
 * is what makes a worker able to query an index.
 */
export function wireSearch(wiring: CapabilityWiring): void {
  wiring.on(Search.method.add, searchAdd);
  wiring.on(Search.method.delete, searchDelete);
  wiring.on(Search.method.search, searchQuery);
}
