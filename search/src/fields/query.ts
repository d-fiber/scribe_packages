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

import type { QueryPlan } from "../../contracts/definition.ts";
import { type MinimumShouldMatch, MultiMatchType, type SearchQuery, type SearchSort } from "../../contracts/query.ts";
import { Fuzziness } from "./value.ts";

/** How many leading characters of a term must match exactly before fuzziness applies. */
const FUZZY_PREFIX_LENGTH = 1;

/** What a clause built from an absent value evaluates to, so an optional filter can be inlined. */
type Falsy = false | 0 | "" | null | undefined;

/**
 * What one piece of typed text matches, over `fields`.
 *
 * @remarks
 * The two clauses answer two different callers. The phrase-prefix one is what makes a search
 * useful while someone is still typing, since it matches the last word as a prefix. The fuzzy
 * one is what catches a word already finished and misspelled, and it keeps the first character
 * exact so that a two-letter query does not match every short word of the index.
 *
 * They are combined by `should` rather than chosen between, because which of the two applies is
 * decided by what was typed and the cluster is what knows.
 */
export function textMatch(text: string, fields: readonly string[]): SearchQuery {
  return {
    bool: {
      should: [
        { multi_match: { query: text, fields: [...fields], type: MultiMatchType.PhrasePrefix } },
        {
          multi_match: {
            query: text,
            fields: [...fields],
            fuzziness: Fuzziness.auto(),
            prefix_length: FUZZY_PREFIX_LENGTH,
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
}

/**
 * One search under construction, which every declaration's query builds into a plan.
 *
 * ```ts
 * q.text(params.text)
 *   .filter(params.status && f.field("status"))
 *   .sort(sorts.newest);
 * ```
 *
 * @remarks
 * Every method takes a value that may be absent and drops the clause when it is, which is what
 * lets a declaration read as the list of the parameters it accepts rather than as a chain of
 * conditionals around a mutable object.
 *
 * A builder is handed to one call of one declaration's query and thrown away, so it is safe
 * for it to be mutable. It is never shared and never kept.
 */
export class QueryBuilder {
  readonly #textFields: readonly string[];
  #must: SearchQuery = { match_all: {} };
  readonly #filter: SearchQuery[] = [];
  readonly #mustNot: SearchQuery[] = [];
  readonly #should: SearchQuery[] = [];
  #minimumShouldMatch: MinimumShouldMatch | null = null;
  #sort: SearchSort[] = [];

  /**
   * @param textFields - The analysed fields of the declaration, each carrying its own weight,
   * which is what a text clause looks in when it names none.
   */
  constructor(textFields: readonly string[]) {
    this.#textFields = textFields;
  }

  /**
   * Matches `text` against `fields`, or against every analysed field of the declaration.
   *
   * The declaration already said which fields hold text and what each one weighs, so naming
   * them again at every query is a second place to keep in step. A caller that wants a
   * narrower search passes `fields` and the declaration's own list is left alone.
   */
  text(text: string | undefined, fields?: readonly string[]): this {
    const looked = fields ?? this.#textFields;
    if (text && looked.length > 0) this.#must = textMatch(text, looked);
    return this;
  }

  /** Replaces what must match and contribute to the score. Keeps what it had when `query` is absent. */
  must(query: SearchQuery | Falsy): this {
    if (query) this.#must = query;
    return this;
  }

  /** Adds a clause that must match without contributing to the score. */
  filter(query: SearchQuery | Falsy): this {
    if (query) this.#filter.push(query);
    return this;
  }

  /** Adds a clause that must not match. */
  mustNot(query: SearchQuery | Falsy): this {
    if (query) this.#mustNot.push(query);
    return this;
  }

  /** Adds a clause that raises the score of the documents it matches. */
  should(query: SearchQuery | Falsy): this {
    if (query) this.#should.push(query);
    return this;
  }

  /** How many of the `should` clauses a document must match to be kept. */
  minimumShouldMatch(value: MinimumShouldMatch): this {
    this.#minimumShouldMatch = value;
    return this;
  }

  /** Replaces the sort clauses, in the order they break ties. Scoring order when never called. */
  sort(clauses: SearchSort | readonly SearchSort[]): this {
    this.#sort = Array.isArray(clauses) ? [...clauses] : [clauses as SearchSort];
    return this;
  }

  /** What this builder compiles into, which is what travels to the cluster. */
  build(): QueryPlan {
    return {
      bool: {
        must: this.#must,
        ...(this.#filter.length > 0 ? { filter: this.#filter } : {}),
        ...(this.#mustNot.length > 0 ? { must_not: this.#mustNot } : {}),
        ...(this.#should.length > 0 ? { should: this.#should } : {}),
        ...(this.#minimumShouldMatch !== null ? { minimum_should_match: this.#minimumShouldMatch } : {}),
      },
      sort: this.#sort,
    };
  }
}
