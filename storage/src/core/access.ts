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

import { StorageIdentity, type StorageOwner } from "../access/identity.ts";
import type { PathNamedArgs } from "../path/template.ts";
import { StorageVisibility } from "../access/visibility.ts";

export type StorageWriter = "admins" | "users" | "any-account";

export type StorageReader = "anyone" | "admins";

export type StorageOwnershipCheck<S extends string> = (
  account: StorageOwner,
  args: PathNamedArgs<S>,
) => boolean | Promise<boolean>;

export type StorageWriteRule<S extends string> =
  | StorageWriter
  | { readonly by: StorageWriter; readonly owns: StorageOwnershipCheck<S> };

export interface StorageAccess<S extends string> {
  readonly read: StorageReader;
  readonly write: StorageWriteRule<S>;
}

export function writerOf<S extends string>(
  write: StorageWriteRule<S>,
): StorageWriter {
  return typeof write === "string" ? write : write.by;
}

export function ownershipOf<S extends string>(
  write: StorageWriteRule<S>,
): StorageOwnershipCheck<S> | undefined {
  return typeof write === "string" ? undefined : write.owns;
}

export function identityOf(writer: StorageWriter): StorageIdentity {
  switch (writer) {
    case "admins":
      return StorageIdentity.Admin;
    case "users":
      return StorageIdentity.User;
    case "any-account":
      return StorageIdentity.Any;
  }
}

export function visibilityOf(reader: StorageReader): StorageVisibility {
  return reader === "admins" ? StorageVisibility.Private : StorageVisibility.Public;
}
