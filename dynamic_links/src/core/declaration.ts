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

import type { Time } from "@scribe/core/contracts/common/time.ts";
import type { Pagination } from "@scribe/core/contracts/pagination.ts";
import { Failure, OK, type Result } from "@scribe/core/contracts/result.ts";
import { type CreatedLink, LinkError, LinkKind, type LinkPreview, type LinkStatistic } from "../../contracts/link.ts";
import { deleteLink, insertLink, linkBySlug } from "../db/links.ts";
import { statisticsOf } from "../db/statistics.ts";
import { forgetLink } from "../runtime/cache.ts";
import { guarded } from "./guard.ts";
import { declareLink } from "./registry.ts";
import { generateSlug } from "./slug.ts";
import { type LinkParams, LinkTemplate } from "./template.ts";
import { isSafeRedirectUrl } from "./url.ts";

/** How many slugs are drawn before creation gives up. */
const MAX_SLUG_ATTEMPTS = 5;

/** How many visits a page of statistics holds when the caller asks for no size. */
const DEFAULT_PAGE_SIZE = 30;

/** The parameters of a declaration, as everything that did not come from a caller sees them. */
type RawParams = Readonly<Record<string, string>>;

/** What declaring a link takes beyond its name and its template. */
export interface LinkOptions<P extends string> {
  /** What the card shows when a messenger unfurls the link. Nothing shown when absent. */
  readonly preview?: (params: LinkParams<P>) => LinkPreview;

  /** How long a link of this declaration resolves. Forever when absent. */
  readonly ttl?: Time;
}

/** What declaring a deeplink takes beyond what every declaration takes. */
export interface DeeplinkOptions<P extends string> extends LinkOptions<P> {
  /**
   * Where a browser goes, since a browser cannot open an application route.
   *
   * A deeplink without it resolves to a route and nothing else, which is what a link only ever
   * opened from inside the application wants.
   */
  readonly web?: (params: LinkParams<P>) => string;
}

/** What creating one link takes beyond its parameters. */
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
 * export const invite = DynamicLink.deeplink("invite", "/invite/{code}", {
 *   web: ({ code }) => `https://poppin.app/invite/${code}`,
 *   preview: ({ code }) => ({ title: `Invitation ${code}` }),
 *   ttl: Time.days(30),
 * });
 *
 * const created = await invite.create({ code: "A1B2" });
 * ```
 *
 * The template carries the parameters in the type, so a call that forgets one does not compile.
 * A row holds the name of the declaration and those parameters, and nothing else: what a link
 * points at is decided here, in code, rather than copied into every row when it was created.
 *
 * A declaration is **built, not extended**: the constructor is private, and everything it needs
 * is given at once. Registration happens as it is built, so a form that took the target in a
 * second call would leave a declaration registered under its name while it still points nowhere.
 */
export class DynamicLink<P extends string> {
  /** The name a row carries, which is what resolution looks a declaration up by. */
  readonly name: string;

  /** Which client this declaration sends a visitor to. */
  readonly kind: LinkKind;

  /** The template this declaration renders, placeholders included, as it was declared. */
  readonly pattern: P;

  readonly #template: LinkTemplate;
  readonly #web: ((params: RawParams) => string) | null;
  readonly #preview: ((params: RawParams) => LinkPreview) | null;
  readonly #ttl: Time | null;

  private constructor(
    name: string,
    kind: LinkKind,
    pattern: P,
    web: ((params: RawParams) => string) | null,
    options: LinkOptions<P>,
  ) {
    this.name = name;
    this.kind = kind;
    this.pattern = pattern;
    this.#template = new LinkTemplate(pattern);
    this.#web = web;
    this.#preview = options.preview as ((params: RawParams) => LinkPreview) | undefined ?? null;
    this.#ttl = options.ttl ?? null;
    declareLink(this as unknown as DynamicLink<string>);
  }

  /**
   * A link the native application opens on `route`, with an optional address for a browser.
   *
   * @param name - The name rows carry, which no other declaration may take.
   * @param route - The route the application opens, with one placeholder per parameter.
   *
   * @throws {LinkTemplateError} When `route` is not a template a link could render.
   * @throws {TypeError} When another declaration already took `name`.
   */
  static deeplink<P extends string>(
    name: string,
    route: P,
    options: DeeplinkOptions<P> = {},
  ): DynamicLink<P> {
    const web = options.web as ((params: RawParams) => string) | undefined ?? null;
    return new DynamicLink<P>(name, LinkKind.Deeplink, route, web, options);
  }

  /**
   * A link that sends a visitor to the address `target` renders.
   *
   * @param name - The name rows carry, which no other declaration may take.
   * @param target - The address to send to, with one placeholder per parameter.
   *
   * @throws {LinkTemplateError} When `target` is not a template a link could render.
   * @throws {TypeError} When another declaration already took `name`.
   */
  static redirect<P extends string>(
    name: string,
    target: P,
    options: LinkOptions<P> = {},
  ): DynamicLink<P> {
    const template = new LinkTemplate(target);
    return new DynamicLink<P>(
      name,
      LinkKind.Redirect,
      target,
      (params) => template.render(params) ?? "",
      options,
    );
  }

  /**
   * Creates one link of this declaration and answers the slug it took.
   *
   * @param params - One value per placeholder of the template.
   *
   * @remarks
   * Up to five slugs are drawn, because the table refuses a slug it already holds. Five
   * collisions in a row on 62¹⁰ addresses is not a collision, it is a table that stopped
   * accepting the insert, so the failure names the conflict rather than retrying forever.
   */
  create(params: LinkParams<P>, options: CreateLinkOptions = {}): Promise<Result<CreatedLink, LinkError>> {
    return guarded(async () => {
      const raw = params as RawParams;
      if (!this.#template.accepts(raw)) return new Failure(LinkError.Params);

      const expiresAt = options.expiresAt !== undefined ? options.expiresAt : this.#expiry();

      for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
        const slug = generateSlug();
        const row = await insertLink({
          slug,
          payload: { k: this.name, a: raw },
          expiresAt,
          userId: options.userId ?? null,
        });
        if (!row) continue;

        await forgetLink(row.slug);
        return new OK({ slug: row.slug, expiresAt: row.expires_at, createdAt: row.created_at });
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
      if (!row || row.payload.k !== this.name) return new Failure(LinkError.NotFound);

      const removed = await deleteLink(slug);
      if (!removed) return new Failure(LinkError.Backend);

      await forgetLink(slug);
      return new OK();
    });
  }

  /** The page of visits recorded against `slug`, newest first. */
  statistics(slug: string, page: LinkPage = {}): Promise<Result<Pagination<LinkStatistic>, LinkError>> {
    return guarded(async () => {
      const row = await linkBySlug(slug);
      if (!row || row.payload.k !== this.name) return new Failure(LinkError.NotFound);

      const offset = page.offset ?? 0;
      const size = page.size ?? DEFAULT_PAGE_SIZE;
      return new OK(await statisticsOf(row.link_id, offset, size));
    });
  }

  /**
   * The route the application opens for `params`, null for a declaration that names no route.
   *
   * Also null when `params` does not fill the template, which is what a link written before the
   * declaration gained a placeholder leaves behind.
   */
  routeFor(params: RawParams): string | null {
    return this.kind === LinkKind.Deeplink ? this.#template.render(params) : null;
  }

  /** The address a browser is sent to for `params`, null when this declaration names none. */
  targetFor(params: RawParams): string | null {
    if (this.#web === null) return null;

    const target = this.#web(params as LinkParams<P>);
    return isSafeRedirectUrl(target) ? target : null;
  }

  /** What a card shows for `params`, null when this declaration writes no preview. */
  previewFor(params: RawParams): LinkPreview | null {
    return this.#preview === null ? null : this.#preview(params);
  }

  #expiry(): number | null {
    return this.#ttl === null ? null : Date.now() + this.#ttl.ms;
  }
}
