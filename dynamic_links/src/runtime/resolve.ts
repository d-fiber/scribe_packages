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

import { Failure, OK, type Result } from "@scribe/core/contracts/result.ts";
import { LinkError, type LinkOutcome, type LinkPreview, type LinkVisitor } from "../../contracts/link.ts";
import type { AnyLinkData, DynamicLink, LinkData } from "../core/declaration.ts";
import type { LinkDestination, Visit } from "../core/destination.ts";
import { guarded } from "../core/guard.ts";
import { previewOf } from "../core/preview.ts";
import { type AnyDynamicLink, linkNamed } from "../core/registry.ts";
import { linkBySlug } from "../db/links.ts";
import { dynamicLinkStatisticsQueue } from "../db/statistics.ts";
import type { DynamicLinkRow } from "../db/tables.ts";
import { cachedLink } from "./cache.ts";

/**
 * A link that answered, and everything the node serving it needs.
 *
 * It is what carries the measurement too: a visit is recorded through the link it was made on,
 * so nothing has to hold the numeric identifier of a row to say what became of a click.
 */
export class ResolvedLink {
  /** The slug that was asked for. */
  readonly slug: string;

  /** The data the link was created with, as its row holds it. */
  readonly data: AnyLinkData;

  /** When this link stops resolving, in milliseconds, null for a link that never expires. */
  readonly expiresAt: number | null;

  readonly #id: number;
  readonly #declaration: AnyDynamicLink;

  /**
   * @param row - The row the slug resolved to.
   * @param declaration - The declaration its payload names, already found in the registry.
   */
  constructor(row: DynamicLinkRow, declaration: AnyDynamicLink) {
    this.slug = row.slug;
    this.data = row.payload.a;
    this.expiresAt = row.expires_at;
    this.#id = row.link_id;
    this.#declaration = declaration;
  }

  /** The name of the declaration this link was created from. */
  get name(): string {
    return this.#declaration.name;
  }

  /**
   * Where `visit` is sent, as this link's declaration decides it.
   *
   * It reaches nothing and reads no request: the page hands over what it read, and the answer is
   * a value a test can assert on without serving anything.
   */
  destination(visit: Visit): LinkDestination {
    return this.#declaration.destinationFor(visit, this.data);
  }

  /**
   * What a card shows for this link in `locale`, null when no rule was declared.
   *
   * The rule is the one `onLinkPreview` holds, so the text is written where a project keeps its
   * translations rather than on the declaration, which is read long before anybody opens it.
   */
  preview(locale: string | null): LinkPreview | null {
    return previewOf({ name: this.name, data: this.data }, locale);
  }

  /**
   * Whether this link was created from `declaration`, which also types its data.
   *
   * ```ts
   * if (link.declaredBy(invite)) link.data.code;
   * ```
   */
  declaredBy<T extends LinkData<T>>(
    declaration: DynamicLink<T>,
  ): this is ResolvedLink & { readonly data: T } {
    return this.#declaration === (declaration as unknown as AnyDynamicLink);
  }

  /**
   * Records what became of this visit, without waiting for the write.
   *
   * @param outcome - What the node serving the link did with it.
   * @param visitor - What the client announced about itself, empty when it announced nothing.
   */
  async record(outcome: LinkOutcome, visitor: LinkVisitor = {}): Promise<void> {
    await dynamicLinkStatisticsQueue.push({ linkId: this.#id, outcome, visitor });
  }
}

/**
 * The link `slug` answers to, or why it does not answer.
 *
 * @remarks
 * The answer is cached for ten minutes, the absence of an answer included. A slug nobody ever
 * created is what an address scanner asks for, and caching only the links that exist would send
 * every one of those queries to Postgres.
 */
export function resolveLink(slug: string): Promise<Result<ResolvedLink, LinkError>> {
  return guarded(async () => {
    const row = await cachedLink(slug, () => linkBySlug(slug));
    if (!row) return new Failure(LinkError.NotFound);
    if (row.expires_at !== null && row.expires_at < Date.now()) return new Failure(LinkError.Expired);

    const declaration = linkNamed(row.payload.k);
    if (!declaration) return new Failure(LinkError.Unknown);

    return new OK(new ResolvedLink(row, declaration));
  });
}
