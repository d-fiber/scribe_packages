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

/**
 * What "dynamic_links" hands whoever mounts it.
 *
 * @remarks
 * Everything it is made of lives in `src/`, the types it publishes in `contracts/`, and this is
 * the one file that names them: a file no line below reaches is a file this package does not
 * publish.
 *
 * `scribe` at the bottom is the other half of what it hands over. It is the three moments the
 * host may run this package at, and a package that runs at none of them says so with an empty
 * one rather than by exporting nothing.
 */

import type { LifecycleSteps } from "@scribe/alchemy";

export { DynamicLink } from "./src/core/declaration.ts";
export type {
  AnyLinkData,
  CreateLinkOptions,
  DeeplinkOptions,
  LinkData,
  LinkOptions,
  LinkPage,
  LinkValue,
  RedirectOptions,
  RoutedOptions,
} from "./src/core/declaration.ts";
export { DestinationKind, Link } from "./src/core/destination.ts";
export type { AppOptions, LinkDestination, LinkFactory, Visit } from "./src/core/destination.ts";
export { onLinkPreview } from "./src/core/preview.ts";
export type { LinkPreviewRule, PreviewedLink } from "./src/core/preview.ts";
export { declaredLinks, linkNamed } from "./src/core/registry.ts";
export type { AnyDynamicLink } from "./src/core/registry.ts";
export { generateSlug } from "./src/core/slug.ts";
export { LinkTemplate, LinkTemplateError } from "./src/core/template.ts";
export { isSafeRedirectUrl } from "./src/core/url.ts";

export { forgetLink } from "./src/runtime/cache.ts";
export { ResolvedLink, resolveLink } from "./src/runtime/resolve.ts";

export { dynamicLinkStatisticsQueue } from "./src/db/statistics.ts";
export type { RecordedVisit } from "./src/db/statistics.ts";
export type { DynamicLinkRow, DynamicLinkStatisticRow, StoredPayload } from "./src/db/tables.ts";

export { LinkError, LinkKind, LinkOutcome, LinkPlatform } from "./contracts/link.ts";
export type { CreatedLink, LinkPreview, LinkStatistic, LinkVisitor } from "./contracts/link.ts";

/**
 * When this package runs, which is at none of the three moments.
 *
 * @remarks
 * Nothing here answers a port or reads the environment: what this package does, it does when
 * something calls it. The member is written empty rather than left out, because an entry that
 * exports nothing for it and one whose steps are misspelt look the same to the host.
 */
export const scribe: LifecycleSteps = {};
