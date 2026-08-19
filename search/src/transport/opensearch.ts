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

import { Client } from "@opensearch-project/opensearch";
import type { IndexConfig } from "../../contracts/definition.ts";
import type { IndexedDocument, SearchHits, SearchRequest, SearchTransport } from "../../contracts/transport.ts";
import { searchSettings } from "../settings.ts";

/** The status an index that exists answers `HEAD` with. */
const FOUND = 200;

/** What one search answered, as much of it as this transport reads. */
interface ClusterAnswer {
  /** The matched documents and how many there were in total, absent when nothing matched. */
  hits?: {
    /** One entry per matched document, carrying the identifier it was written under. */
    hits?: { _id?: string }[];

    /** How many documents matched in total, which pagination is computed against. */
    total?: { value?: number };
  };
}

/** What one bulk write answered, as much of it as this transport reads. */
interface BulkAnswer {
  /** Whether at least one line of the batch was refused. */
  errors?: boolean;

  /** One entry per line, keyed by the operation it carried. */
  items?: Record<string, { error?: unknown }>[];
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
  async ensure(name: string, config: IndexConfig): Promise<boolean> {
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

  /** Writes `documents` into `name`, and answers how many the cluster took. */
  index(name: string, documents: readonly IndexedDocument[]): Promise<number> {
    const body = documents.flatMap((one) => [{ index: { _index: name, _id: one.id } }, one.source]);
    return this.#bulk(name, body, documents.length, "index");
  }

  /** Takes `ids` out of `name`, and answers how many went. */
  remove(name: string, ids: readonly string[]): Promise<number> {
    const body = ids.map((id) => ({ delete: { _index: name, _id: id } }));
    return this.#bulk(name, body, ids.length, "delete");
  }

  /**
   * Answers what `request` matched, or null when the cluster could not answer.
   *
   * The identifiers come from the `_id` each hit was written under, which is why no source is
   * fetched at all. Reading them out of the document instead would answer nothing whenever a
   * declaration does not map its key column as a field, and mapping it is something no
   * declaration has a reason to do.
   */
  async search(request: SearchRequest): Promise<SearchHits | null> {
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

      return { ids, total: answer.hits?.total?.value ?? 0 };
    } catch (error) {
      console.error(`[search:opensearch] index "${request.index}" refused a search.`, error);
      return null;
    }
  }

  /**
   * Sends `body` as one bulk call, and answers how many of its `sent` lines went through.
   *
   * A bulk call answers per line, so a batch where one document is refused still writes the
   * others. Counting the refused ones is what lets the drain leave those in the outbox and
   * take the rest out.
   */
  async #bulk(name: string, body: Record<string, unknown>[], sent: number, operation: string): Promise<number> {
    if (sent === 0) return 0;

    try {
      const answer = (await this.#cluster().bulk({ body })).body as BulkAnswer;
      if (!answer.errors) return sent;

      const refused = (answer.items ?? []).filter((item) => item[operation]?.error !== undefined);
      console.error(`[search:opensearch] index "${name}" refused ${refused.length} of ${sent} documents.`);

      return sent - refused.length;
    } catch (error) {
      console.error(`[search:opensearch] index "${name}" refused a batch of ${sent} documents.`, error);
      return 0;
    }
  }
}
