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

import type { Time } from "@scribe/core/contracts/common/time.ts";
import type { Pagination } from "@scribe/core/contracts/pagination.ts";
import { Failure, OK, type Result } from "@scribe/core/contracts/result.ts";
import { type CreatedLink, LinkError, LinkKind, type LinkStatistic } from "../../contracts/link.ts";
import { deleteLink, insertLink, linkBySlug } from "../db/links.ts";
import { statisticsOf } from "../db/statistics.ts";
import { forgetLink } from "../runtime/cache.ts";
import { Link, type LinkDestination, type Visit } from "./destination.ts";
import { guarded } from "./guard.ts";
import { declareLink } from "./registry.ts";
import { generateSlug } from "./slug.ts";
import { LinkTemplate } from "./template.ts";
import { isSafeRedirectUrl } from "./url.ts";

const MAX_SLUG_ATTEMPTS = 5;
const DEFAULT_PAGE_SIZE = 30;
const APP_ROOT = "/";

/** What one field of a link may hold, which is what a JSON column reads back unchanged. */
export type LinkValue = string | number | boolean;

/**
 * The shape a declaration's data has to have, one scalar per field.
 *
 * It is written against `T` itself rather than as an index signature, because an interface has
 * no index signature and a project names its data with an interface.
 */
export type LinkData<T> = { readonly [K in keyof T]: LinkValue };

/** Any declaration's data, as everything that did not come from one declaration sees it. */
export type AnyLinkData = Readonly<Record<string, LinkValue>>;

/** What every declaration takes, whatever it sends a visitor to. */
export interface LinkOptions {
  /** How long a link of this declaration resolves. Forever when absent. */
  readonly ttl?: Time;
}

/** What declaring a deeplink takes beyond its name. */
export interface DeeplinkOptions extends LinkOptions {
  /**
   * The route the application opens, with one placeholder per field it reads.
   *
   * The application opens on its own root when absent, which is what a link that only carries
   * data wants: the declaration's name and that data are enough for the application to route
   * itself.
   */
  readonly path?: string;
}

/** What declaring a redirect takes beyond its name. */
export interface RedirectOptions extends LinkOptions {
  /** The address a visitor is sent to, with one placeholder per field it reads. */
  readonly url: string;
}

/** What declaring a routed link takes beyond its name. */
export interface RoutedOptions<T extends LinkData<T>> extends LinkOptions {
  /**
   * Where one visit is sent, decided from what the page knows about it.
   *
   * It is the only code a declaration carries, which is why it is a factory of its own rather
   * than an option the two others also accept.
   */
  readonly decide: (visit: Visit, data: T) => LinkDestination;
}

/** What creating one link takes beyond its data. */
export interface CreateLinkOptions {
  /** When this link stops resolving, in milliseconds. The declaration's own when absent. */
  readonly expiresAt?: number | null;

  /** The account creating the link. No owner when absent. */
  readonly userId?: string | null;
}

/** Which slice of the visits a page of statistics answers with. */
export interface LinkPage {
  /** How many visits to skip. Zero when absent. */
  readonly offset?: number;

  /** How many visits to answer with. Thirty when absent. */
  readonly size?: number;
}

/**
 * One kind of link a project creates, and what a visitor holding it is sent to.
 *
 * ```ts
 * interface Invite {
 *   code: string;
 *   invitedBy: string;
 * }
 *
 * const invite = DynamicLink.deeplink<Invite>("invite", {
 *   path: "/invite/{code}",
 *   ttl: Time.days(30),
 * });
 *
 * await invite.create({ code: "A1B2", invitedBy: accountId });
 * ```
 *
 * The declaration names its data with an interface, and a row holds that data beside the name of
 * the declaration. Where a link points is decided here, in code, rather than copied into every
 * row when it was created, so changing a route changes every link already handed out.
 *
 * Three factories, and the third is the only one that carries code. `deeplink` and `redirect`
 * declare a destination and nothing else; `routed` decides one per visit, from the platform, the
 * country and the data. A card is not declared here at all: it is read in the language of
 * whoever opens the link, which nobody knows this early, so it lives in `onLinkPreview`.
 *
 * A declaration is **built, not extended**: the constructor is private and registration happens
 * as it is built, so a form that took the destination in a second call would leave a declaration
 * registered under its name while it still points nowhere.
 */
export class DynamicLink<T extends LinkData<T> = AnyLinkData> {
  /** The name a row carries, which is what resolution looks a declaration up by. */
  readonly name: string;

  /** Which of the three ways this declaration was declared. */
  readonly kind: LinkKind;

  /** The template this declaration renders, empty for a declaration that renders none. */
  readonly pattern: string;

  readonly #template: LinkTemplate | null;
  readonly #decide: ((visit: Visit, data: T) => LinkDestination) | null;
  readonly #ttl: Time | null;

  private constructor(
    name: string,
    kind: LinkKind,
    pattern: string,
    decide: ((visit: Visit, data: T) => LinkDestination) | null,
    ttl: Time | null,
  ) {
    this.name = name;
    this.kind = kind;
    this.pattern = pattern;
    this.#template = pattern === "" ? null : new LinkTemplate(pattern);
    this.#decide = decide;
    this.#ttl = ttl;
    declareLink(this as unknown as DynamicLink);
  }

  /**
   * A link the native application opens, on `options.path` when it names one.
   *
   * @param name - The name rows carry, which no other declaration may take.
   *
   * @throws {LinkTemplateError} When `options.path` is not a template a link could render.
   * @throws {TypeError} When another declaration already took `name`.
   */
  static deeplink<T extends LinkData<T> = AnyLinkData>(
    name: string,
    options: DeeplinkOptions = {},
  ): DynamicLink<T> {
    return new DynamicLink<T>(
      name,
      LinkKind.Deeplink,
      options.path ?? "",
      null,
      options.ttl ?? null,
    );
  }

  /**
   * A link that sends a visitor to the address `options.url` renders.
   *
   * @param name - The name rows carry, which no other declaration may take.
   *
   * @throws {LinkTemplateError} When `options.url` is not a template a link could render.
   * @throws {TypeError} When another declaration already took `name`.
   */
  static redirect<T extends LinkData<T> = AnyLinkData>(
    name: string,
    options: RedirectOptions,
  ): DynamicLink<T> {
    return new DynamicLink<T>(
      name,
      LinkKind.Redirect,
      options.url,
      null,
      options.ttl ?? null,
    );
  }

  /**
   * A link whose destination is decided per visit by `options.decide`.
   *
   * @param name - The name rows carry, which no other declaration may take.
   *
   * @throws {TypeError} When another declaration already took `name`.
   */
  static routed<T extends LinkData<T> = AnyLinkData>(
    name: string,
    options: RoutedOptions<T>,
  ): DynamicLink<T> {
    return new DynamicLink<T>(
      name,
      LinkKind.Routed,
      "",
      options.decide,
      options.ttl ?? null,
    );
  }

  /**
   * Creates one link of this declaration and answers the slug it took.
   *
   * @param data - The data this link carries, which the application reads when it opens.
   *
   * @remarks
   * Up to five slugs are drawn, because the table refuses a slug it already holds. Five
   * collisions in a row on 62¹⁰ addresses is not a collision, it is a table that stopped
   * accepting the insert, so the failure names the conflict rather than retrying forever.
   */
  create(
    data: T,
    options: CreateLinkOptions = {},
  ): Promise<Result<CreatedLink, LinkError>> {
    return guarded(async () => {
      if (this.#template !== null && !this.#template.accepts(rendered(data as AnyLinkData))) {
        return new Failure(LinkError.Params);
      }

      const expiresAt = options.expiresAt !== undefined ? options.expiresAt : this.#expiry();

      for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
        const slug = generateSlug();
        const row = await insertLink({
          slug,
          payload: { k: this.name, a: data },
          expiresAt,
          userId: options.userId ?? null,
        });
        if (!row) continue;

        await forgetLink(row.slug);
        return new OK({
          slug: row.slug,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
        });
      }

      return new Failure(LinkError.SlugConflict);
    });
  }

  /**
   * Stops `slug` from resolving, and answers what removing it did.
   *
   * A slug this declaration did not write answers `NotFound` rather than being removed: a link
   * belongs to the declaration whose name its row carries, and one declaration reaching into
   * another's links would make a name mean nothing.
   */
  revoke(slug: string): Promise<Result<void, LinkError>> {
    return guarded(async () => {
      const row = await linkBySlug(slug);
      if (!row || row.payload.k !== this.name) {
        return new Failure(LinkError.NotFound);
      }

      const removed = await deleteLink(slug);
      if (!removed) return new Failure(LinkError.Backend);

      await forgetLink(slug);
      return new OK();
    });
  }

  /** The page of visits recorded against `slug`, newest first. */
  statistics(
    slug: string,
    page: LinkPage = {},
  ): Promise<Result<Pagination<LinkStatistic>, LinkError>> {
    return guarded(async () => {
      const row = await linkBySlug(slug);
      if (!row || row.payload.k !== this.name) {
        return new Failure(LinkError.NotFound);
      }

      const offset = page.offset ?? 0;
      const size = page.size ?? DEFAULT_PAGE_SIZE;
      return new OK(await statisticsOf(row.link_id, offset, size));
    });
  }

  /**
   * Where `visit` is sent for a link carrying `data`.
   *
   * It is what the page serving a slug calls, and it reaches nothing: a decision is a value, so
   * a project asserts on what its rule answered without serving anything. A template that
   * `data` no longer fills answers nowhere, which is what a link written before the declaration
   * gained a placeholder leaves behind.
   */
  destinationFor(visit: Visit, data: T): LinkDestination {
    if (this.#decide !== null) return this.#decide(visit, data);

    const target = this.#template === null ? null : this.#template.render(rendered(data as AnyLinkData));
    if (this.kind === LinkKind.Redirect) {
      return target !== null && isSafeRedirectUrl(target) ? Link.web(target) : Link.notFound();
    }

    if (this.#template !== null && target === null) return Link.notFound();
    return Link.app(target ?? APP_ROOT);
  }

  #expiry(): number | null {
    return this.#ttl === null ? null : Date.now() + this.#ttl.ms;
  }
}

function rendered(data: AnyLinkData): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, String(value)]),
  );
}
