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

import { Failure, Ok, okay } from "@scribe/alchemy";
import { bucketOf } from "../bucket/registry.ts";
import { objectUrl } from "../core/visibility.ts";
import { forgetObjects, type RecordedWrite, recordObject } from "../db/objects.ts";
import { extensionOf } from "../media/extension.ts";
import { mimeTypeOf } from "../media/mime.ts";
import { mediaError } from "../media/validation.ts";
import { StoragePathError } from "../path/segment.ts";
import type { StorageResourceConfig } from "./config.ts";
import {
  StorageRemoveError,
  type StorageRemoveResult,
  StorageUploadError,
  type StorageUploadResult,
} from "./result.ts";

/**
 * One object of a storage tree: where it goes, what it accepts, and what an upload answers.
 *
 * Nothing here asks who is calling. A route settles that before it uploads, and what this class
 * checks is what the declaration said: the extension, the size, and that every argument renders
 * into a usable key.
 */
export abstract class StorageResource<TData, TArgs extends string[]> {
  readonly #config: StorageResourceConfig<TArgs>;

  constructor(config: StorageResourceConfig<TArgs>) {
    this.#config = config;
  }

  /** What an upload answers, built from the key it wrote and the bytes it was given. */
  protected abstract decorate(path: string, file: File): TData | Promise<TData>;

  /**
   * The blur hash carried by `data`, which the index keeps next to the object.
   *
   * A resource nothing can be drawn from answers null, and that is the default here rather than
   * an abstract member, because a file is the case where there is nothing to derive.
   */
  protected blurHash(_data: TData): string | null {
    return null;
  }

  /**
   * Writes `file` at the key `args` render, and answers what the resource makes of it.
   *
   * @remarks
   * The extension and the size are checked first, so a refused upload never reaches a bucket.
   * The index is written after the bytes, and an object whose row names another bucket has its
   * old copy removed, since a key designates one object and the stale bytes would otherwise
   * stay readable at their own URL.
   */
  async upload(file: File, ...args: TArgs): Promise<StorageUploadResult<TData>> {
    const invalid = mediaError(file, this.#config.extensions, this.#config.maxSize);
    if (invalid) return new Failure(invalid);

    const path = this.#pathOf(args);
    if (path === null) return new Failure(StorageUploadError.InvalidPath);

    const mimeType = mimeTypeOf(extensionOf(file.name));
    const bytes = await file.arrayBuffer();

    const [stored, data] = await Promise.all([
      bucketOf(this.#config.visibility).upload(path, bytes, mimeType),
      this.decorate(path, file),
    ]);

    if (!stored) return new Failure(StorageUploadError.UploadFailed);

    const written = await this.#record(path, file, mimeType, data);
    if (written === null) return new Failure(StorageUploadError.IndexFailed);
    if (written.displaced !== null) await bucketOf(written.displaced).remove([path]);

    return new Ok(data);
  }

  /** Removes the object `args` render, and forgets the row that named it. */
  remove(...args: TArgs): Promise<StorageRemoveResult> {
    return this.removeMany([args]);
  }

  /**
   * Removes every object `argsList` renders, in one call to the bucket.
   *
   * A path that cannot be rendered stops the whole batch before anything is removed, so a
   * caller never has to work out which half of its list went.
   */
  async removeMany(argsList: readonly TArgs[]): Promise<StorageRemoveResult> {
    if (argsList.length === 0) return okay;

    const paths: string[] = [];
    for (const args of argsList) {
      const path = this.#pathOf(args);
      if (path === null) return new Failure(StorageRemoveError.InvalidPath);
      paths.push(path);
    }

    if (!(await bucketOf(this.#config.visibility).remove(paths))) {
      return new Failure(StorageRemoveError.RemoveFailed);
    }

    if (!(await this.#forget(paths))) return new Failure(StorageRemoveError.IndexFailed);
    return okay;
  }

  /** Where the object `args` render is served from, or null when they render no usable key. */
  url(...args: TArgs): string | null {
    const path = this.#pathOf(args);
    return path === null ? null : this.urlOf(path);
  }

  /** Where `path` is served from, left as it is when it already is an address. */
  urlOf(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    return objectUrl(path, this.#config.visibility);
  }

  async #record(
    path: string,
    file: File,
    mimeType: string,
    data: TData,
  ): Promise<RecordedWrite | null> {
    try {
      const written = await recordObject({
        path,
        visibility: this.#config.visibility,
        mimeType,
        byteSize: file.size,
        blurHash: this.blurHash(data),
      });

      return written.stored ? written : null;
    } catch (e) {
      console.error(`[storage:index] ${path} could not be written:`, e);
      return null;
    }
  }

  async #forget(paths: readonly string[]): Promise<boolean> {
    try {
      return await forgetObjects(paths);
    } catch (e) {
      console.error(`[storage:index] ${paths.length} rows could not be dropped:`, e);
      return false;
    }
  }

  #pathOf(args: TArgs): string | null {
    try {
      return this.#config.path(...args);
    } catch (e) {
      if (e instanceof StoragePathError) return null;
      throw e;
    }
  }
}
