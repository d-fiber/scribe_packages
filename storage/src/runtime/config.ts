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


import type { Size } from "@scribe/core/contracts/common/size.ts";
import type { StorageVisibility } from "../core/visibility.ts";

/** Renders the key of one object, from the arguments its folder's template asks for. */
export type StoragePath<TArgs extends string[]> = (...args: TArgs) => string;

/** What a declaration hands a resource, once its folder has resolved everything it knew. */
export interface StorageResourceConfig<TArgs extends string[]> {
  /** The bucket this resource writes to, inherited from the folder that declared it. */
  readonly visibility: StorageVisibility;

  /** The extensions an upload may carry, lowercase and without their dot. */
  readonly extensions: readonly string[];

  /** The largest upload this resource takes. */
  readonly maxSize: Size;

  /** Where the bytes go, which is the folder's rendered prefix plus this resource's name. */
  readonly path: StoragePath<TArgs>;
}
