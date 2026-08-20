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

import { Failure, OK, type Result } from "@scribe/core/contracts/result.ts";
import { LinkError, type LinkOutcome, type LinkPreview, type LinkVisitor } from "../../contracts/link.ts";
import type { DynamicLink } from "../core/declaration.ts";
import { guarded } from "../core/guard.ts";
import { type AnyDynamicLink, linkNamed } from "../core/registry.ts";
import type { LinkParams } from "../core/template.ts";
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

  /** The parameters the link was created with, as its row holds them. */
  readonly args: Readonly<Record<string, string>>;

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
    this.args = row.payload.a;
    this.expiresAt = row.expires_at;
    this.#id = row.link_id;
    this.#declaration = declaration;
  }

  /** The name of the declaration this link was created from. */
  get name(): string {
    return this.#declaration.name;
  }

  /** The route the application opens, null for a link that names no route. */
  get route(): string | null {
    return this.#declaration.routeFor(this.args);
  }

  /** The address a browser is sent to, null for a link that names none. */
  get target(): string | null {
    return this.#declaration.targetFor(this.args);
  }

  /** What a card shows for this link, null when its declaration writes no preview. */
  get preview(): LinkPreview | null {
    return this.#declaration.previewFor(this.args);
  }

  /**
   * Whether this link was created from `declaration`, which also types its parameters.
   *
   * ```ts
   * if (link.declaredBy(invite)) link.args.code;
   * ```
   */
  declaredBy<P extends string>(
    declaration: DynamicLink<P>,
  ): this is ResolvedLink & { readonly args: LinkParams<P> } {
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
