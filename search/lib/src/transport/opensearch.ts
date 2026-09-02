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

import { Client, errors } from "@opensearch-project/opensearch";
import { Failure, Ok, type Result } from "@scribe/alchemy";
import type { Future } from "@scribe/alchemy";
import type { IndexConfig } from "../../contracts/definition.ts";
import { SearchError } from "../../contracts/definition.ts";
import type { IndexedDocument, SearchHits, SearchRequest, SearchTransport } from "../../contracts/transport.ts";
import { searchSettings } from "../settings.ts";

/** The status an index that exists answers `HEAD` with. */
const FOUND = 200;

/** The status a bulk line answers when the document it named was already gone. */
const NOT_FOUND = 404;

/** What one search answered, as much of it as this transport reads. */
interface ClusterAnswer {
  /** The matched documents, absent when nothing matched. */
  hits?: {
    /** One entry per matched document, carrying the identifier it was written under. */
    hits?: { _id?: string }[];
  };
}

/** What one bulk write answered, as much of it as this transport reads. */
interface BulkAnswer {
  /** Whether at least one line of the batch was refused. */
  errors?: boolean;

  /** One entry per line, keyed by the operation it carried, in the order the actions were sent. */
  items?: Record<string, { status?: number; error?: unknown }>[];
}

/**
 * The cluster a mounted package writes to, and answers its searches from.
 *
 * @remarks
 * Every method answers rather than throws, because a cluster is the one part of a search that
 * is not in the same process: an outage has to reach the drain as a count that came up short
 * and the caller of a search as an empty section, not as an exception thrown three layers
 * below whoever asked.
 *
 * The client is built at the first call and not in the constructor, since a transport is
 * installed at import and the settings it needs are handed over by whoever mounts the package.
 */
export class OpenSearchTransport implements SearchTransport {
  #client: Client | null = null;

  /** The client this transport writes through, built once. */
  #cluster(): Client {
    return this.#client ??= new Client({ node: searchSettings.get().clusterUrl });
  }

  /**
   * Makes `name` exist and match `config`, and answers whether it now does.
   *
   * An index that does not exist is created whole. One that does has its analysis written
   * first, which needs the index closed since a normalizer cannot be redefined while it is
   * serving, then its mapping. A field the mapping adds lands on the existing documents as
   * empty until they are rebuilt, and a field it retypes is refused by the cluster: that is
   * what an index declared under a second name is for.
   */
  async ensure(name: string, config: IndexConfig): Future<boolean> {
    try {
      const client = this.#cluster();
      const exists = await client.indices.exists({ index: name });

      if (exists.statusCode !== FOUND) {
        await client.indices.create({ index: name, body: config });
        return true;
      }

      if (config.settings) {
        await client.indices.close({ index: name });
        try {
          await client.indices.putSettings({ index: name, body: { settings: config.settings } });
        } finally {
          await client.indices.open({ index: name });
        }
      }

      await client.indices.putMapping({ index: name, body: config.mappings });
      return true;
    } catch (error) {
      console.error(`[search:opensearch] index "${name}" could not be made to match its declaration.`, error);
      return false;
    }
  }

  /** Writes `documents` into `name`, and answers the identifiers that went in. */
  index(name: string, documents: readonly IndexedDocument[]): Future<readonly string[]> {
    const body = documents.flatMap((one) => [{ index: { _index: name, _id: one.id } }, one.source]);
    return this.#bulk(name, documents.map((one) => one.id), body, "index");
  }

  /** Takes `ids` out of `name`, and answers the identifiers now absent from it. */
  remove(name: string, ids: readonly string[]): Future<readonly string[]> {
    const body = ids.map((id) => ({ delete: { _index: name, _id: id } }));
    return this.#bulk(name, ids, body, "delete");
  }

  /**
   * Answers what `request` matched, or why it could not.
   *
   * The identifiers come from the `_id` each hit was written under, which is why no source is
   * fetched at all. Reading them out of the document instead would answer nothing whenever a
   * declaration does not map its key column as a field, and mapping it is something no
   * declaration has a reason to do.
   */
  async search(request: SearchRequest): Future<Result<SearchHits, SearchError>> {
    try {
      const { body } = await this.#cluster().search({
        index: request.index,
        body: {
          _source: false,
          query: { bool: request.plan.bool },
          ...(request.plan.sort.length > 0 ? { sort: [...request.plan.sort] } : {}),
          from: request.from,
          size: request.size,
        },
      });

      const answer = body as ClusterAnswer;
      const ids = (answer.hits?.hits ?? [])
        .map((hit) => hit._id)
        .filter((id): id is string => typeof id === "string");

      return new Ok({ ids });
    } catch (error) {
      console.error(`[search:opensearch] index "${request.index}" refused a search.`, error);
      return new Failure(error instanceof errors.ResponseError ? SearchError.Refused : SearchError.Unavailable);
    }
  }

  /**
   * Sends `body` as one bulk call, and answers the identifiers of `ids` that went through.
   *
   * A bulk call answers per line, so a batch where one document is refused still writes the
   * others: each answer is read back against the identifier that named its line, in the order
   * both were sent. A `delete` line the cluster answers with {@link NOT_FOUND} counts as
   * succeeded regardless of `error`, since the document being gone is the caller's goal and it
   * already holds.
   */
  async #bulk(
    name: string,
    ids: readonly string[],
    body: Record<string, unknown>[],
    operation: "index" | "delete",
  ): Future<readonly string[]> {
    if (ids.length === 0) return [];

    try {
      const answer = (await this.#cluster().bulk({ body })).body as BulkAnswer;
      if (!answer.errors) return [...ids];

      const items = answer.items ?? [];
      const succeeded = ids.filter((_, at) => {
        const item = items[at]?.[operation];
        return item?.error === undefined || (operation === "delete" && item.status === NOT_FOUND);
      });

      console.error(
        `[search:opensearch] index "${name}" refused ${ids.length - succeeded.length} of ${ids.length} documents.`,
      );
      return succeeded;
    } catch (error) {
      console.error(`[search:opensearch] index "${name}" refused a batch of ${ids.length} documents.`, error);
      return [];
    }
  }
}
