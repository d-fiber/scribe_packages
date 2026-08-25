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

import "@scribe/testing/settings.ts";
import type { InstalledMock } from "@scribe/testing/install.ts";
import type { IndexConfig } from "@scribe/search/lib/contracts/definition.ts";
import type {
  IndexedDocument,
  SearchHits,
  SearchRequest,
  SearchTransport,
} from "@scribe/search/lib/contracts/transport.ts";
import { SearchTransports } from "@scribe/search/lib/src/transport/registry.ts";

/** A transport that keeps every call instead of reaching a cluster, so a test can read them. */
export class RecordingTransport implements SearchTransport {
  /** The configuration each index was last asked to match, keyed by index name. */
  readonly ensured: Map<string, IndexConfig> = new Map<string, IndexConfig>();

  /** The documents held per index, keyed by index name and then by document identifier. */
  readonly documents: Map<string, Map<string, Record<string, unknown>>> = new Map<
    string,
    Map<string, Record<string, unknown>>
  >();

  /** Every request handed over since this transport was installed, oldest first. */
  readonly requests: SearchRequest[] = [];

  #hits: SearchHits | null = { ids: [], total: 0 };

  /** Makes every following search answer `ids`, and a total of as many. */
  answer(ids: readonly string[]): void {
    this.#hits = { ids, total: ids.length };
  }

  /** Makes every following search answer nothing at all, which is what an unreachable cluster does. */
  answerNothing(): void {
    this.#hits = null;
  }

  /** Keeps `config` under `name` and answers that the index now matches it. */
  ensure(name: string, config: IndexConfig): Promise<boolean> {
    this.ensured.set(name, config);
    return Promise.resolve(true);
  }

  /** Keeps `documents` under `name` and answers how many were kept. */
  index(name: string, documents: readonly IndexedDocument[]): Promise<number> {
    const held = this.#held(name);
    for (const one of documents) held.set(one.id, one.source);
    return Promise.resolve(documents.length);
  }

  /** Drops `ids` from `name` and answers how many were actually held. */
  remove(name: string, ids: readonly string[]): Promise<number> {
    const held = this.#held(name);
    let dropped = 0;
    for (const id of ids) {
      if (held.delete(id)) dropped += 1;
    }
    return Promise.resolve(dropped);
  }

  /** Keeps `request` and answers what the last call to `answer` decided. */
  search(request: SearchRequest): Promise<SearchHits | null> {
    this.requests.push(request);
    return Promise.resolve(this.#hits);
  }

  /** The documents held by the index `name`, in the order they were written. */
  held(name: string): Record<string, unknown>[] {
    return [...this.#held(name).values()];
  }

  /** The last request handed over, or null when nothing was searched yet. */
  get lastRequest(): SearchRequest | null {
    return this.requests.at(-1) ?? null;
  }

  #held(name: string): Map<string, Record<string, unknown>> {
    const held = this.documents.get(name) ?? new Map<string, Record<string, unknown>>();
    this.documents.set(name, held);
    return held;
  }
}

/**
 * Sends every search and every write of the process into a recording transport, and answers
 * the handle that puts the previous one back.
 *
 * @remarks
 * What is replaced is the transport, never a declaration: an index keeps compiling its own
 * plan, deriving its own mapping and reading its own columns, so a test exercises the
 * declaration rather than a second implementation of it written for the test.
 */
export function installSearchMock(): RecordingTransport & InstalledMock {
  const recording = new RecordingTransport();
  const previous = SearchTransports.use(recording);

  return Object.assign(recording, {
    restore(): void {
      SearchTransports.use(previous);
    },
  });
}
