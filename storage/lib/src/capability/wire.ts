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

import { Storage as StorageService } from "@scribe/sdk/gen/scribe/packages/storage/protocol/storage_pb.ts";
import type { CapabilityWiring } from "@scribe/contracts/capability.ts";
import { create } from "@bufbuild/protobuf";
import {
  type DeleteRequest,
  type DeleteResult,
  DeleteResultSchema,
  type ListRequest,
  type ListResult,
  ListResultSchema,
  type ObjectSummary,
  ObjectSummarySchema,
} from "@scribe/sdk/gen/scribe/packages/storage/protocol/storage_pb.ts";
import {
  Bytes,
  declaredStorage,
  Storage,
  type StorageMediaSpec,
  type StorageObject,
  StorageVisibility,
} from "../../storage.ts";

const PLACEHOLDER = /^\{([A-Za-z][A-Za-z0-9_]*)\}$/;

const REMOVAL_SPEC: StorageMediaSpec = { extensions: [], maxSize: Bytes.of(0) };

function failed(scope: string, code: string, cause: unknown): { code: string; message: string } {
  const message = cause instanceof Error ? cause.message : String(cause);
  console.error(`[worker-storage:${scope}] ${message}`);
  return { code, message };
}

/**
 * The values `pathArgs` gives the placeholders of `template`, in the order it writes them, or
 * null when one of them is missing.
 *
 * @remarks
 * The wire names the arguments and the package takes them by position, so somebody has to put
 * them in order. The package does it in `parseTemplate`, which its door does not publish, so the
 * placeholder rule is spelled a second time here. The two would drift apart the day the template
 * grammar gains a form, and the drift would show as a key rendered from the wrong argument,
 * which on a removal means the wrong object goes.
 */
function orderedArgs(template: string, pathArgs: Readonly<Record<string, string>>): string[] | null {
  const args: string[] = [];

  for (const part of template.split("/")) {
    const match = PLACEHOLDER.exec(part);
    if (!match) continue;

    const value = pathArgs[match[1]];
    if (value === undefined) return null;
    args.push(value);
  }

  return args;
}

/**
 * The folder `template` declares, rebuilt under the visibility the project gave it, or null when
 * nothing declared it.
 *
 * @remarks
 * A folder is safe to rebuild because everything it decides comes from the template and the
 * bucket, and both are read back here rather than chosen. Rebuilding it under the declared
 * visibility is also what keeps the package's own declaration registry quiet, since it only
 * refuses a path that comes back naming a different bucket.
 */
function folderOf(template: string): Storage<string> | null {
  const visibility = declaredStorage().get(template);
  if (visibility === undefined) return null;

  return visibility === StorageVisibility.Private ? Storage.private(template) : Storage.public(template);
}

/**
 * `args` as the tuple a rebuilt folder asks for.
 *
 * @remarks
 * A folder carries its template in its type, so one rebuilt from a plain string is seen as
 * taking no argument at all, and the tuple it really needs cannot be written down here. The
 * values are still checked one by one by the package, which refuses anything a key cannot hold
 * at the moment it renders them.
 */
function positional(args: readonly string[]): [] {
  return args as [];
}

/** The page of `objects` starting at `offset` and holding `limit` of them, or all of them at zero. */
function pageOf(objects: readonly StorageObject[], offset: number, limit: number): readonly StorageObject[] {
  const from = Math.max(0, offset);
  return limit > 0 ? objects.slice(from, from + limit) : objects.slice(from);
}

/** When `updatedAt` says the object was last written, in milliseconds, and zero when it says nothing. */
function millisOf(updatedAt: string): bigint {
  const parsed = Date.parse(updatedAt);
  return Number.isNaN(parsed) ? 0n : BigInt(parsed);
}

/** What a worker is told about `object`, without the URL and the blur hash the contract has no field for. */
function summaryOf(object: StorageObject): ObjectSummary {
  return create(ObjectSummarySchema, {
    path: object.path,
    size: { bytes: BigInt(object.byteSize) },
    mimeType: object.mimeType,
    updatedAt: millisOf(object.updatedAt),
  });
}

/**
 * Removes every object the request names, and answers how many it took.
 *
 * @remarks
 * The storage package does the work, through one `removeMany` per folder and filename the
 * request mentions, so a worker deleting many objects of one resource costs one call to the
 * bucket. The count answered is how many objects the request named once the removal went
 * through, not how many were sitting there: the package reports whether the batch landed and
 * never how much it found, and a bucket takes a key holding nothing without complaining.
 *
 * A folder no project declared is refused under `unknown_folder`. A refusal raised on the second
 * batch leaves the objects of the first one gone, since each batch reaches the bucket on its
 * own.
 *
 * The media spec handed to `file` is empty because a removal reads neither the extensions nor
 * the size cap, only the bucket and the rendered key. An upload reads both, which is why this
 * file answers no upload.
 */
export async function storageDelete(request: DeleteRequest): Promise<DeleteResult> {
  if (request.objects.length === 0) return create(DeleteResultSchema, { deleted: 0 });

  const batches = new Map<string, { folder: string; filename: string; args: string[][] }>();

  for (const object of request.objects) {
    if (!object.folder || !object.filename) {
      return create(DeleteResultSchema, {
        error: failed("delete", "invalid_object", "an object names no folder or no filename"),
      });
    }

    const args = orderedArgs(object.folder, object.pathArgs);
    if (args === null) {
      return create(DeleteResultSchema, {
        error: failed("delete", "invalid_path", `${object.folder} was given no value for one of its placeholders`),
      });
    }

    const key = `${object.folder} ${object.filename}`;
    const batch = batches.get(key) ?? { folder: object.folder, filename: object.filename, args: [] };
    batch.args.push(args);
    batches.set(key, batch);
  }

  let deleted = 0;

  for (const batch of batches.values()) {
    try {
      const folder = folderOf(batch.folder);
      if (folder === null) {
        return create(DeleteResultSchema, {
          error: failed("delete", "unknown_folder", `${batch.folder} is not declared by the host.`),
        });
      }

      const removed = await folder.file(batch.filename, REMOVAL_SPEC).removeMany(batch.args.map(positional));
      if (!removed.ok) {
        return create(DeleteResultSchema, {
          error: failed("delete", removed.error, `${batch.folder}/${batch.filename} could not be removed`),
        });
      }
    } catch (cause) {
      return create(DeleteResultSchema, { error: failed("delete", "delete_failed", cause) });
    }

    deleted += batch.args.length;
  }

  return create(DeleteResultSchema, { deleted });
}

/**
 * The objects stored under the folder the request names, as the page it asked for.
 *
 * @remarks
 * The answer comes from the index the storage package keeps rather than from a walk of the
 * bucket, which is what lets every object carry its size and its media type. That index is read
 * whole, up to the five thousand rows the package caps a listing at, and the page is cut here:
 * the folder offers no offset of its own, so a large offset costs the same read as a small one.
 *
 * A limit of zero is read as the whole listing from the offset on, since the contract cannot
 * tell a limit of zero from a limit nobody set. An empty answer means the folder holds nothing,
 * never that it could not be read: a folder no project declared is refused under
 * `unknown_folder`, and an index that did not answer under `list_failed`.
 */
export async function storageList(request: ListRequest): Promise<ListResult> {
  if (!request.folder) {
    return create(ListResultSchema, { error: failed("list", "invalid_object", "missing folder") });
  }

  const args = orderedArgs(request.folder, request.pathArgs);
  if (args === null) {
    return create(ListResultSchema, {
      error: failed("list", "invalid_path", `${request.folder} was given no value for one of its placeholders`),
    });
  }

  try {
    const folder = folderOf(request.folder);
    if (folder === null) {
      return create(ListResultSchema, {
        error: failed("list", "unknown_folder", `${request.folder} is not declared by the host.`),
      });
    }

    const listed = await folder.list(...positional(args));
    if (!listed.ok) {
      return create(ListResultSchema, { error: failed("list", listed.error, `${request.folder} could not be listed`) });
    }

    return create(ListResultSchema, {
      objects: pageOf(listed.data, request.offset, request.limit).map(summaryOf),
    });
  } catch (cause) {
    return create(ListResultSchema, { error: failed("list", "list_failed", cause) });
  }
}

/**
 * Answers the two procedures of `storage.proto` that anything behind them can answer honestly.
 *
 * @remarks
 * `Upload` and `SignedUrl` are left to the host's named 501. The first cannot be addressed without
 * the media spec a declaration carries and the wire does not, and nothing in this package signs a
 * URL, so answering either would mean inventing what it promised.
 */
export function wireStorage(wiring: CapabilityWiring): void {
  wiring.on(StorageService.method.delete, storageDelete);
  wiring.on(StorageService.method.list, storageList);
}
