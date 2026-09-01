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

import type { Duration, Pagination, UnmodifiableList } from "@scribe/alchemy";
import { Failure, Ok, okay, Refusal, type Result, runPooled } from "@scribe/alchemy";
import {
  type CreatedLink,
  type CreateLinkError,
  LinkError,
  LinkKind,
  type LinkPreview,
  type LinkStatistic,
  type RevokeLinkError,
  type StatisticsError,
} from "../../contracts/link.ts";
import { deleteLink, insertLink, insertLinks, linkBySlug, linksBySlug, type NewLink } from "../db/links.ts";
import { statisticsOf } from "../db/statistics.ts";
import type { DynamicLinkRow } from "../db/tables.ts";
import { forgetLink, rememberLink } from "../runtime/cache.ts";
import { Link, type LinkDestination, type Visit } from "./destination.ts";
import type { FieldDescriptor, LinkFields } from "./field.ts";
import { guarded } from "./guard.ts";
import { declareLink } from "./registry.ts";
import { generateSlug } from "./slug.ts";
import { LinkTemplate, type LinkValue } from "./template.ts";
import { isSafeRedirectUrl } from "./url.ts";

export type { LinkValue };

const MAX_SLUG_ATTEMPTS = 5;
const DEFAULT_PAGE_SIZE = 30;
const APP_ROOT = "/";

/** How many rows one bulk insert of {@link DynamicLink.createMany} carries at a time. */
const CREATE_CHUNK_SIZE = 500;

/** How many chunks of {@link DynamicLink.createMany} are written at once. */
const CREATE_CONCURRENCY = 4;

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
export interface LinkOptions<T> {
  /** How long a link of this declaration resolves. Forever when absent. */
  readonly ttl?: Duration;

  /**
   * What a card shows for a link of this declaration, `locale` being the visitor's own.
   *
   * Answering null leaves the link without a card, which is what a declaration with nothing to
   * show wants. Absent here, every link of this declaration is unfurled with none.
   */
  readonly preview?: (data: T, locale: string | null) => LinkPreview | null;

  /**
   * One descriptor per field of `T`, checked against every value this declaration is asked to
   * create a link from.
   *
   * A field the path or the address renders is already checked by the declaration's own
   * template, but a field that carries data without ever appearing in a route is not: `code` in
   * `/invite/{code}` fails `create()` on its own the moment it is missing, while `invitedBy`,
   * declared right next to it in the same interface, does not, and a value that came from a
   * request body rather than a literal in the code has nothing else standing between it and a
   * row. Declaring `fields` closes that gap for every field of `T`, not only the ones a template
   * happens to spell out. Absent here, a value is written exactly as `create()` receives it,
   * checked only against the template's own placeholders.
   */
  readonly fields?: LinkFields<T>;
}

/** What declaring a deeplink takes beyond its name. */
export interface DeeplinkOptions<T> extends LinkOptions<T> {
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
export interface RedirectOptions<T> extends LinkOptions<T> {
  /** The address a visitor is sent to, with one placeholder per field it reads. */
  readonly url: string;
}

/** What declaring a routed link takes beyond its name. */
export interface RoutedOptions<T extends LinkData<T>> extends LinkOptions<T> {
  /**
   * Where one visit is sent, decided from what the page knows about it.
   *
   * It is what makes this declaration `routed` rather than `deeplink` or `redirect`, which is why
   * it is a factory of its own rather than an option the two others also accept.
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
 *   ttl: Duration.days(30),
 * });
 *
 * await invite.create({ code: "A1B2", invitedBy: accountId });
 * ```
 *
 * The declaration names its data with an interface, and a row holds that data beside the name of
 * the declaration. Where a link points is decided here, in code, rather than copied into every
 * row when it was created, so changing a route changes every link already handed out.
 *
 * Three factories, and the third is the only one that carries a decision as code. `deeplink` and
 * `redirect` declare a destination and nothing else; `routed` decides one per visit, from the
 * platform, the country and the data. `preview` is on `LinkOptions` and every one of the three
 * accepts it: it is read in the language of whoever opens the link, which nobody knows this
 * early, so it is a function like `decide` rather than a value, but typed by this declaration's
 * own data the same way `decide` is.
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
  readonly #preview: ((data: T, locale: string | null) => LinkPreview | null) | null;
  readonly #ttl: Duration | null;
  readonly #fields: LinkFields<T> | null;

  private constructor(
    name: string,
    kind: LinkKind,
    pattern: string,
    decide: ((visit: Visit, data: T) => LinkDestination) | null,
    options: LinkOptions<T>,
  ) {
    this.name = name;
    this.kind = kind;
    this.pattern = pattern;
    this.#template = pattern === "" ? null : new LinkTemplate(pattern);
    this.#decide = decide;
    this.#preview = options.preview ?? null;
    this.#ttl = options.ttl ?? null;
    this.#fields = options.fields ?? null;
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
    options: DeeplinkOptions<T> = {},
  ): DynamicLink<T> {
    return new DynamicLink<T>(
      name,
      LinkKind.Deeplink,
      options.path ?? "",
      null,
      options,
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
    options: RedirectOptions<T>,
  ): DynamicLink<T> {
    return new DynamicLink<T>(
      name,
      LinkKind.Redirect,
      options.url,
      null,
      options,
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
      options,
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
   * accepting the insert, so the failure names the conflict rather than retrying forever. A
   * refusal that is not a collision, the table not answering at all, is never retried: doing so
   * would spend up to five round trips discovering what the first one already said.
   */
  create(
    data: T,
    options: CreateLinkOptions = {},
  ): Promise<Result<CreatedLink, CreateLinkError | LinkError.Backend>> {
    return guarded(() => this.#createOne(data, options));
  }

  /**
   * Creates one link per item of `items` and answers one outcome per item, in the same order.
   *
   * @remarks
   * Meant for a burst, thousands of referral codes minted in one call, not for the per-request
   * path that mints one link at a time: `items` is written in chunks of a few hundred, each in
   * one round trip, rather than one round trip per link. A chunk that collides on a slug, which
   * five hundred freshly drawn slugs colliding an existing one all but never does, falls back to
   * writing that chunk's items one at a time so the other chunks are not held back by it.
   *
   * One item failing `Params` never reaches the table at all, and never costs the batch a round
   * trip: every item is checked against this declaration's template first, and only what passes
   * is written.
   *
   * Unlike {@link create}, a link written this way is never dropped from the cache. The slugs are
   * freshly drawn, so the chance that any of them was already asked for and cached as absent is
   * the same vanishing one {@link create} accepts for a single link, multiplied by however many
   * this call wrote, and dropping thousands of cache entries to guard against it would cost more
   * than the absence it guards against.
   */
  async createMany(
    items: UnmodifiableList<T>,
    options: CreateLinkOptions = {},
  ): Promise<readonly Result<CreatedLink, CreateLinkError | LinkError.Backend>[]> {
    const results: Result<CreatedLink, CreateLinkError | LinkError.Backend>[] = new Array(items.length);
    if (items.length === 0) return results;

    const expiresAt = options.expiresAt !== undefined ? options.expiresAt : this.#expiry();
    const pending: number[] = [];

    items.forEach((data, index) => {
      if (!this.#accepts(data)) {
        results[index] = new Failure(LinkError.Params);
        return;
      }
      pending.push(index);
    });

    const chunks: number[][] = [];
    for (let at = 0; at < pending.length; at += CREATE_CHUNK_SIZE) {
      chunks.push(pending.slice(at, at + CREATE_CHUNK_SIZE));
    }

    await runPooled(
      chunks,
      CREATE_CONCURRENCY,
      (chunk) => this.#createChunk(chunk, items, options, expiresAt, results),
    );
    return results;
  }

  /**
   * Stops `slug` from resolving, and answers what removing it did.
   *
   * A slug this declaration did not write answers `NotFound` rather than being removed: a link
   * belongs to the declaration whose name its row carries, and one declaration reaching into
   * another's links would make a name mean nothing.
   */
  revoke(slug: string): Promise<Result<void, RevokeLinkError | LinkError.Backend>> {
    return guarded(async () => {
      const row = await linkBySlug(slug);
      if (!row || row.payload.k !== this.name) {
        return new Failure(LinkError.NotFound);
      }

      const removed = await deleteLink(slug);
      if (!removed) return new Failure(LinkError.Backend);

      await forgetLink(slug);
      return okay;
    });
  }

  /** The page of visits recorded against `slug`, newest first. */
  statistics(
    slug: string,
    page: LinkPage = {},
  ): Promise<Result<Pagination<LinkStatistic>, StatisticsError | LinkError.Backend>> {
    return guarded(async () => {
      const row = await linkBySlug(slug);
      if (!row || row.payload.k !== this.name) {
        return new Failure(LinkError.NotFound);
      }

      const offset = page.offset ?? 0;
      const size = page.size ?? DEFAULT_PAGE_SIZE;
      return new Ok(await statisticsOf(row.link_id, offset, size));
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

    const target = this.#template === null ? null : this.#template.render(data as AnyLinkData);
    if (this.kind === LinkKind.Redirect) {
      return target !== null && isSafeRedirectUrl(target) ? Link.web(target) : Link.notFound();
    }

    if (this.#template !== null && target === null) return Link.notFound();
    return Link.app(target ?? APP_ROOT);
  }

  /** What a card shows for a link carrying `data` in `locale`, null when this declaration names no rule. */
  previewFor(data: T, locale: string | null): LinkPreview | null {
    return this.#preview === null ? null : this.#preview(data, locale);
  }

  async #createOne(
    data: T,
    options: CreateLinkOptions,
  ): Promise<Result<CreatedLink, CreateLinkError | LinkError.Backend>> {
    if (!this.#accepts(data)) {
      return new Failure(LinkError.Params);
    }

    const expiresAt = options.expiresAt !== undefined ? options.expiresAt : this.#expiry();

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const slug = generateSlug();
      const written = await this.#insertOne({
        slug,
        payload: { k: this.name, a: data as AnyLinkData },
        expiresAt,
        userId: options.userId ?? null,
      });

      if (written.ok) {
        this.#rememberSoon(written.data);
        return new Ok({
          slug: written.data.slug,
          expiresAt: written.data.expires_at,
          createdAt: written.data.created_at,
        });
      }

      if (written.error.kind !== "conflict") return new Failure(LinkError.Backend);
    }

    return new Failure(LinkError.SlugConflict);
  }

  /** Whether `data` passes both this declaration's template and its field descriptors. */
  #accepts(data: T): boolean {
    const record = data as AnyLinkData;
    if (this.#template !== null && !this.#template.accepts(record)) return false;
    if (this.#fields === null) return true;

    const fields = this.#fields as Readonly<Record<string, FieldDescriptor<LinkValue>>>;
    return Object.entries(fields).every(([name, descriptor]) => descriptor.accepts(record[name]));
  }

  async #createChunk(
    indexes: readonly number[],
    items: UnmodifiableList<T>,
    options: CreateLinkOptions,
    expiresAt: number | null,
    results: Result<CreatedLink, CreateLinkError | LinkError.Backend>[],
  ): Promise<void> {
    const slugs = indexes.map(() => generateSlug());
    const rows: NewLink[] = indexes.map((index, at) => ({
      slug: slugs[at],
      payload: { k: this.name, a: items[index] as AnyLinkData },
      expiresAt,
      userId: options.userId ?? null,
    }));

    const written = await this.#insertChunk(rows);
    if (written.ok) {
      const found = await linksBySlug(slugs);
      const bySlug = new Map(found.map((row) => [row.slug, row] as const));
      indexes.forEach((index, at) => {
        const row = bySlug.get(slugs[at]);
        results[index] = row
          ? new Ok({ slug: row.slug, expiresAt: row.expires_at, createdAt: row.created_at })
          : new Failure(LinkError.Backend);
      });
      return;
    }

    if (written.error.kind !== "conflict") {
      indexes.forEach((index) => {
        results[index] = new Failure(LinkError.Backend);
      });
      return;
    }

    await runPooled(indexes, CREATE_CONCURRENCY, async (index) => {
      results[index] = await this.#createOne(items[index], options);
    });
  }

  async #insertOne(link: NewLink): Promise<Result<DynamicLinkRow, Refusal>> {
    try {
      return await insertLink(link);
    } catch (cause) {
      return new Failure(Refusal.unavailable(String(cause)));
    }
  }

  async #insertChunk(rows: readonly NewLink[]): Promise<Result<number, Refusal>> {
    try {
      return await insertLinks(rows);
    } catch (cause) {
      return new Failure(Refusal.unavailable(String(cause)));
    }
  }

  /**
   * Writes `row` into the cache in the background, keyed by the slug it was just given.
   *
   * `#createOne` already holds the row it inserted, so this spares the very first resolution of
   * a freshly created link, made by whoever the creator hands it to first, the round trip a cache
   * miss would otherwise cost against a table that would only answer back what this call already
   * has in hand.
   */
  #rememberSoon(row: DynamicLinkRow): void {
    rememberLink(row).catch((cause) => {
      console.error(`[dynamic-links:cache] failed to remember slug ${row.slug} after create: ${String(cause)}`);
    });
  }

  #expiry(): number | null {
    return this.#ttl === null ? null : Date.now() + this.#ttl.inMilliseconds;
  }
}
