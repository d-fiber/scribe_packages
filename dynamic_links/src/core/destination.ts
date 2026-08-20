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

import type { LinkPlatform } from "../../contracts/link.ts";

/** What a destination is, which is what the page serving a slug switches on. */
export enum DestinationKind {
  /** Open the native application on a route, falling back when it does not answer. */
  App = "app",

  /** Send the browser to an address. */
  Web = "web",

  /** Send the visitor to the store of the platform it came from. */
  Store = "store",

  /** Answer that nothing is there. */
  None = "none",
}

/** Where the page sends a visitor once it has decided. */
export type LinkDestination =
  | { readonly kind: DestinationKind.App; readonly path: string; readonly fallback: LinkDestination }
  | { readonly kind: DestinationKind.Web; readonly url: string }
  | { readonly kind: DestinationKind.Store }
  | { readonly kind: DestinationKind.None };

/** What the page falls back to when a routed declaration names nothing. */
export interface AppOptions {
  /**
   * Where the visitor goes when the application does not answer.
   *
   * The store when absent, since an unanswered attempt most often means the application is not
   * installed. A declaration that would rather show a page names it here.
   */
  readonly fallback?: LinkDestination;
}

/** The four destinations a visit can end in, as the factory building them. */
export interface LinkFactory {
  /** Tries the native application on `path`, and takes the fallback when it does not answer. */
  app(path: string, options?: AppOptions): LinkDestination;

  /** Sends the browser to `url`. */
  web(url: string): LinkDestination;

  /** Sends the visitor to the store of the platform it came from. */
  store(): LinkDestination;

  /** Answers that the slug leads nowhere. */
  notFound(): LinkDestination;
}

/**
 * The four destinations a visit can end in.
 *
 * ```ts
 * Link.app("/invite/abc", { fallback: Link.store() });
 * ```
 *
 * Nothing here reaches the network or reads a request. A decision is a value, so a project can
 * assert on what its rule answered without serving anything.
 */
export const Link: LinkFactory = {
  /**
   * Tries the native application on `path`, and takes `fallback` when it does not answer.
   *
   * The server never learns whether the application is installed. A visit that reaches the page
   * at all has already not been taken by the operating system, so this is an attempt and the
   * fallback is what most visitors actually get.
   */
  app(path: string, options: AppOptions = {}): LinkDestination {
    return {
      kind: DestinationKind.App,
      path,
      fallback: options.fallback ?? Link.store(),
    };
  },

  /** Sends the browser to `url`. */
  web(url: string): LinkDestination {
    return { kind: DestinationKind.Web, url };
  },

  /** Sends the visitor to the store of the platform it came from, and to nothing on a desktop. */
  store(): LinkDestination {
    return { kind: DestinationKind.Store };
  },

  /** Answers that the slug leads nowhere. */
  notFound(): LinkDestination {
    return { kind: DestinationKind.None };
  },
};

/** What the page knows about one visit, which is everything a rule may read. */
export interface Visit {
  /** The platform the user agent announces, `Web` for anything that is not a phone. */
  readonly platform: LinkPlatform;

  /** Whether the visit comes from a robot unfurling the link rather than from a person. */
  readonly isCrawler: boolean;

  /** The user agent as it was sent, kept whole. */
  readonly userAgent: string;

  /** The address the visit came from, as the node serving it saw it. */
  readonly ipAddress: string;

  /** The two-letter country the address resolves to, null when nothing resolves it. */
  readonly country: string | null;

  /** The first language of `Accept-Language`, null when the client sent none. */
  readonly language: string | null;
}
