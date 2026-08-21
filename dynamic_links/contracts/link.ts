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

/** Which client a declaration sends a visitor to, which is what its template renders. */
export enum LinkKind {
  /** A route the native application opens, with a web address as its fallback. */
  Deeplink = "deeplink",

  /** A web address, and nothing else. */
  Redirect = "redirect",

  /** A link whose destination one rule decides per visit. */
  Routed = "routed",
}

/** What became of one visit, as the node that served the link reports it. */
export enum LinkOutcome {
  /** The page standing between the link and its target was rendered. */
  Served = "served",

  /** The visitor was sent to the web target. */
  Redirected = "redirected",

  /** The native application took the visit. */
  OpenedApp = "opened_app",

  /** The application was not installed, so the visitor was sent to the store. */
  StoreFallback = "store_fallback",

  /** A robot unfurling the link, which is a visit no person made. */
  Crawler = "crawler",
}

/** The platform a visit came from, as the client announces it. */
export enum LinkPlatform {
  /** An iOS device. */
  IOS = "ios",

  /** An Android device. */
  Android = "android",

  /** A browser, whatever it runs on. */
  Web = "web",
}

/** What a link shows when a messenger or a crawler unfurls it. */
export interface LinkPreview {
  /** The headline of the card, which is the one part a declaration must fill. */
  readonly title: string;

  /** The line under the headline, absent when the declaration writes none. */
  readonly description?: string;

  /** The picture of the card, kept only when it is an http address. */
  readonly imageUrl?: string;
}

/** What one visit carries besides its outcome, every part of it optional. */
export interface LinkVisitor {
  /** The account the visit was made from, absent for a visitor who is not signed in. */
  readonly userId?: string;

  /** The identifier the client announces for the device, which is not an account. */
  readonly deviceId?: string;

  /** The address the visit came from, as the node that served it saw it. */
  readonly ipAddress?: string;

  /** The user agent the visit carried, kept whole. */
  readonly userAgent?: string;

  /** The page the visit came from, absent when the client sent none. */
  readonly referer?: string;

  /** The platform the visit came from, absent when the client announced none. */
  readonly platform?: LinkPlatform;
}

/** Why a link could not be created, resolved or revoked. */
export enum LinkError {
  /** No link answers to this slug. */
  NotFound = "not_found",

  /** The link exists, and its expiry has passed. */
  Expired = "expired",

  /**
   * The link names a declaration this process has not loaded.
   *
   * It is what a caller sees when the route serving the link never imported the declaration,
   * and what stays after a declaration is renamed while its links are still in the table.
   */
  Unknown = "unknown",

  /** The parameters do not render the template the declaration was built with. */
  Params = "params",

  /** Five slugs in a row were refused by the table, which only a broken sequence explains. */
  SlugConflict = "slug_conflict",

  /** Postgres refused the query, or could not be reached. */
  Backend = "backend",
}

/** A link as its declaration just created it. */
export interface CreatedLink {
  /** The slug the link answers to, which is the only part of it a URL carries. */
  readonly slug: string;

  /** When the link stops resolving, in milliseconds, null for a link that never expires. */
  readonly expiresAt: number | null;

  /** When the row was written, in milliseconds. */
  readonly createdAt: number;
}

/** One recorded visit, as a page of statistics answers it. */
export interface LinkStatistic {
  /** The identifier the table assigned to this visit. */
  readonly id: number;

  /** What became of the visit. */
  readonly outcome: LinkOutcome;

  /** The platform the visit came from, null when the client announced none. */
  readonly platform: LinkPlatform | null;

  /** The account the visit was made from, null for a visitor who was not signed in. */
  readonly userId: string | null;

  /** The device the client announced, null when it announced none. */
  readonly deviceId: string | null;

  /** The address the visit came from, null when the node recorded none. */
  readonly ipAddress: string | null;

  /** The user agent the visit carried, null when it carried none. */
  readonly userAgent: string | null;

  /** The page the visit came from, null when the client sent none. */
  readonly referer: string | null;

  /** When the visit was recorded, in milliseconds. */
  readonly createdAt: number;
}
