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
import { extensionOf } from "../media/extension.ts";
import { mimeTypeOf } from "../media/mime.ts";
import { mediaError } from "../media/validation.ts";
import type { StorageResourceConfig } from "./config.ts";
import { requireIdentity, type StorageSession } from "../access/identity.ts";
import { authorizeOwnership } from "../access/ownership.ts";
import { StoragePathError } from "../path/segment.ts";
import { StorageRemoveError, type StorageRemoveResult, StorageUploadError, type StorageUploadResult } from "./result.ts";
import { objectUrl } from "../access/visibility.ts";

export abstract class StorageResource<TData, TArgs extends string[]> {
  readonly #config: StorageResourceConfig<TArgs>;

  constructor(config: StorageResourceConfig<TArgs>) {
    this.#config = config;
  }

  protected abstract decorate(path: string, file: File): TData | Promise<TData>;

  async upload(
    file: File,
    ...args: TArgs
  ): Promise<StorageUploadResult<TData>> {
    const session = requireIdentity(this.#config.identity);
    if (!session) return new Failure(StorageUploadError.Unauthorized);

    if (!(await this.#authorized(session, args))) {
      return new Failure(StorageUploadError.Unauthorized);
    }

    const invalid = mediaError(
      file,
      this.#config.extensions,
      this.#config.maxSize,
    );
    if (invalid) return new Failure(invalid);

    const path = this.#pathOf(session, args);
    if (path === null) return new Failure(StorageUploadError.InvalidPath);

    const contentType = mimeTypeOf(extensionOf(file.name));
    const bytes = await file.arrayBuffer();

    const [stored, data] = await Promise.all([
      bucketOf(this.#config.visibility).upload(path, bytes, contentType),
      this.decorate(path, file),
    ]);

    if (!stored) return new Failure(StorageUploadError.UploadFailed);
    return new OK(data);
  }

  remove(...args: TArgs): Promise<StorageRemoveResult> {
    return this.removeMany([args]);
  }

  async removeMany(argsList: readonly TArgs[]): Promise<StorageRemoveResult> {
    if (argsList.length === 0) return new OK();

    const session = requireIdentity(this.#config.identity);
    if (!session) return new Failure(StorageRemoveError.Unauthorized);

    const paths: string[] = [];
    for (const args of argsList) {
      if (!(await this.#authorized(session, args))) {
        return new Failure(StorageRemoveError.Unauthorized);
      }
      const path = this.#pathOf(session, args);
      if (path === null) return new Failure(StorageRemoveError.InvalidPath);
      paths.push(path);
    }

    const ok = await bucketOf(this.#config.visibility).remove(paths);
    return ok ? new OK() : new Failure(StorageRemoveError.RemoveFailed);
  }

  url(...args: TArgs): string | null {
    const session = requireIdentity(this.#config.identity);
    if (!session) return null;

    const path = this.#pathOf(session, args);
    return path === null ? null : this.urlOf(path);
  }

  urlOf(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    return objectUrl(path, this.#config.visibility);
  }

  #authorized(session: StorageSession, args: TArgs): Promise<boolean> {
    return authorizeOwnership(session, this.#config.authorize, args);
  }

  #pathOf(session: StorageSession, args: TArgs): string | null {
    try {
      return this.#config.path(session, ...args);
    } catch (e) {
      if (e instanceof StoragePathError) return null;
      throw e;
    }
  }
}
