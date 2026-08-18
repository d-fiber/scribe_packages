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

import { Failure, OK } from "@scribe/core/contracts/result.ts";
import { bucketOf } from "../bucket/registry.ts";
import { requireIdentity, type StorageSession } from "../access/identity.ts";
import { authorizeOwnership } from "../access/ownership.ts";
import { StoragePathError } from "../path/segment.ts";
import {
  StorageListError,
  type StorageListResult,
  type StorageObject,
  StorageRemoveError,
  type StorageRemoveResult,
} from "./result.ts";
import type { StorageScope } from "../path/scope.ts";
import { objectUrl, STORAGE_VISIBILITIES } from "../access/visibility.ts";

const MAX_LISTED_OBJECTS = 5_000;

export interface StorageFolderOperations<TArgs extends string[]> {
  list(...args: TArgs): Promise<StorageListResult>;
  clear(...args: TArgs): Promise<StorageRemoveResult>;
}

export function folderOperations<TArgs extends string[]>(
  scope: StorageScope<TArgs>,
): StorageFolderOperations<TArgs> {
  const authorize = scope.authorize;

  return {
    async list(...args: TArgs): Promise<StorageListResult> {
      const session = requireIdentity(scope.identity);
      if (!session) return new Failure(StorageListError.Unauthorized);

      if (!(await authorizeOwnership(session, authorize, args))) {
        return new Failure(StorageListError.Unauthorized);
      }

      const prefix = prefixOf(scope, session, args);
      if (prefix === null) return new Failure(StorageListError.InvalidPath);

      const objects: StorageObject[] = [];
      for (const visibility of STORAGE_VISIBILITIES) {
        const budget = MAX_LISTED_OBJECTS - objects.length;
        if (budget <= 0) break;

        const found = await bucketOf(visibility).listTree(prefix, budget);
        if (found === null) return new Failure(StorageListError.ListFailed);

        for (const object of found) {
          objects.push({
            path: object.path,
            url: objectUrl(object.path, visibility),
            visibility,
            updatedAt: object.updatedAt,
          });
        }
      }

      if (objects.length >= MAX_LISTED_OBJECTS) {
        console.error(
          `[storage:list] ${prefix} hit the ${MAX_LISTED_OBJECTS} object cap: the result is truncated.`,
        );
      }

      return new OK(objects);
    },

    async clear(...args: TArgs): Promise<StorageRemoveResult> {
      const session = requireIdentity(scope.identity);
      if (!session) return new Failure(StorageRemoveError.Unauthorized);

      if (!(await authorizeOwnership(session, authorize, args))) {
        return new Failure(StorageRemoveError.Unauthorized);
      }

      const prefix = prefixOf(scope, session, args);
      if (prefix === null) return new Failure(StorageRemoveError.InvalidPath);

      for (const visibility of STORAGE_VISIBILITIES) {
        if (!(await bucketOf(visibility).removeTree(prefix))) {
          return new Failure(StorageRemoveError.RemoveFailed);
        }
      }

      return new OK();
    },
  };
}

function prefixOf<TArgs extends string[]>(
  scope: StorageScope<TArgs>,
  session: StorageSession,
  args: TArgs,
): string | null {
  try {
    return scope.prefix(session, args);
  } catch (e) {
    if (e instanceof StoragePathError) return null;
    throw e;
  }
}
