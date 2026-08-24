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

import type { Bytes } from "@scribe/alchemy";
import { Failure, Ok, okay } from "@scribe/alchemy";
import { bucketOf } from "../bucket/registry.ts";
import { forgetObjects, objectsUnder } from "../db/objects.ts";
import type { StorageObjectRow } from "../db/tables.ts";
import { pathSegment, StoragePathError } from "../path/segment.ts";
import { parseTemplate, renderTemplate, type PathArgs, type TemplateSegment } from "../path/template.ts";
import { FileResource } from "../resources/file.ts";
import { ImageResource } from "../resources/image.ts";
import { VideoResource } from "../resources/video.ts";
import type { StorageResourceConfig } from "../runtime/config.ts";
import { StorageListError, StorageRemoveError, type StorageListResult, type StorageObject, type StorageRemoveResult } from "../runtime/result.ts";
import { declareStorage } from "./registry.ts";
import { objectUrl, StorageVisibility } from "./visibility.ts";

const MAX_LISTED_OBJECTS = 5_000;
const CLEARED_PAGE_SIZE = 1_000;

/** What a resource accepts, whatever kind of media it holds. */
export interface StorageMediaSpec {
  /** The extensions an upload may carry, lowercase and without their dot. */
  readonly extensions: readonly string[];

  /** The largest upload this resource takes, refused before the bytes reach a bucket. */
  readonly maxSize: Bytes;
}

/**
 * A folder of a storage tree, the path it renders, and the resources declared under it.
 *
 * ```ts
 * export const users = Storage.public("users/{userId}");
 * export const avatar = users.image("avatar", { extensions: ["png"], maxSize: Bytes.megabytes(10) });
 *
 * export const docs = users.child("docs/{docId}");
 * export const contract = docs.file("contract", { extensions: ["pdf"], maxSize: Bytes.megabytes(20) });
 *
 * await avatar.upload(file, userId);
 * await contract.upload(file, userId, docId);
 * ```
 *
 * `P` is the template accumulated down the tree, and everything else derives from it: the
 * arguments an upload takes are `PathArgs<P>`, one string per `{...}`, in the order the template
 * writes them. A call that forgets a segment does not compile, which is the whole point of
 * carrying the template in the type rather than a count of arguments.
 *
 * Nothing here decides whether a caller may reach an object. This is a backend package: a route
 * knows who is calling and settles that before it calls. What a declaration decides is where the
 * bytes land, which is what `public` and `private` name.
 *
 * A folder is **built, not extended**: the constructor is private, so there is nothing to
 * subclass and nothing to override. It is safe to keep at module scope, since it holds no client
 * and no identity.
 */
export class Storage<P extends string> {
  /** The template this folder renders, placeholders included, as it was declared. */
  readonly path: P;

  /** Which bucket the objects under this folder are written to. */
  readonly visibility: StorageVisibility;

  readonly #segments: readonly TemplateSegment[];
  readonly #argNames: readonly string[];
  readonly #taken = new Set<string>();

  private constructor(
    path: P,
    visibility: StorageVisibility,
    segments: readonly TemplateSegment[],
    argNames: readonly string[],
  ) {
    this.path = path;
    this.visibility = visibility;
    this.#segments = segments;
    this.#argNames = argNames;
    declareStorage(path, visibility);
  }

  /**
   * A folder whose objects anyone holding their URL can read.
   *
   * @throws {StoragePathError} When `path` is not a template that renders into a usable key.
   */
  static public<P extends string>(path: P): Storage<P> {
    return Storage.#folder(path, StorageVisibility.Public);
  }

  /**
   * A folder whose objects a URL alone reads nothing of.
   *
   * It is the one to reach for when the answer is not obvious: an object put in the open bucket
   * by mistake stays readable for as long as its key is guessable, and moving it later does not
   * unpublish what has already been fetched.
   *
   * @throws {StoragePathError} When `path` is not a template that renders into a usable key.
   */
  static private<P extends string>(path: P): Storage<P> {
    return Storage.#folder(path, StorageVisibility.Private);
  }

  static #folder<P extends string>(
    path: P,
    visibility: StorageVisibility,
  ): Storage<P> {
    const template = parseTemplate(path);
    return new Storage<P>(
      path,
      visibility,
      template.segments,
      template.argNames,
    );
  }

  /**
   * A folder nested under this one, taking the arguments of both templates in order.
   *
   * @param path - The template to append, which may add placeholders of its own.
   * @param visibility - The bucket the child writes to. Defaults to this folder's own, which is
   * what makes a whole branch land in one place without repeating it.
   *
   * @throws {TypeError} When `path` reuses a placeholder an enclosing folder already writes, or
   * when its first segment is already taken by a resource of this folder. Two placeholders of
   * the same name would put two arguments in the same position, and the caller has no way to
   * say which one it meant.
   */
  child<C extends string>(
    path: C,
    visibility: StorageVisibility = this.visibility,
  ): Storage<`${P}/${C}`> {
    const template = parseTemplate(path);

    for (const name of template.argNames) {
      if (this.#argNames.includes(name)) {
        throw new TypeError(
          `storage path "${this.path}/${path}" writes {${name}} twice, once at each level.`,
        );
      }
    }

    const first = template.segments[0];
    if (first.kind === "literal") this.#claim(first.value);

    return new Storage<`${P}/${C}`>(
      `${this.path}/${path}`,
      visibility,
      [...this.#segments, ...template.segments],
      [...this.#argNames, ...template.argNames],
    );
  }

  /** A picture stored under this folder, whose upload also derives a blur hash. */
  image(name: string, spec: StorageMediaSpec): ImageResource<PathArgs<P>> {
    return new ImageResource<PathArgs<P>>(this.#leaf(name, spec));
  }

  /** A video stored under this folder, whose upload derives a blur hash from its first frame. */
  video(name: string, spec: StorageMediaSpec): VideoResource<PathArgs<P>> {
    return new VideoResource<PathArgs<P>>(this.#leaf(name, spec));
  }

  /** Anything else stored under this folder, kept as the bytes it was given. */
  file(name: string, spec: StorageMediaSpec): FileResource<PathArgs<P>> {
    return new FileResource<PathArgs<P>>(this.#leaf(name, spec));
  }

  /**
   * The objects stored under this folder, in path order, whichever bucket each one is in.
   *
   * @remarks
   * The answer comes from the index this package keeps, not from a walk of the buckets, so it
   * carries the size, the media type and the blur hash of every object, which a listing of keys
   * cannot give. It reads at most 5 000 rows and reports when it stops there.
   */
  async list(...args: PathArgs<P>): Promise<StorageListResult> {
    const prefix = this.#prefixOf(args);
    if (prefix === null) return new Failure(StorageListError.InvalidPath);

    const page = await objectsUnder(prefix, MAX_LISTED_OBJECTS);
    if (page === null) return new Failure(StorageListError.ListFailed);

    if (page.full) {
      console.error(
        `[storage:list] ${prefix} hit the ${MAX_LISTED_OBJECTS} object cap: the result is truncated.`,
      );
    }

    return new Ok(page.objects.map(objectOf));
  }

  /**
   * Removes every object stored under this folder, and forgets the rows that named them.
   *
   * @remarks
   * It works one page at a time and each round takes its own rows out of the index, so a folder
   * of any size empties without a cap on how many objects that may be. A round that cannot
   * reach a bucket stops there, and what is already gone stays gone: running it again finishes
   * the job, since removing an object that is no longer there succeeds.
   */
  async clear(...args: PathArgs<P>): Promise<StorageRemoveResult> {
    const prefix = this.#prefixOf(args);
    if (prefix === null) return new Failure(StorageRemoveError.InvalidPath);

    let after = "";
    for (;;) {
      const page = await objectsUnder(prefix, CLEARED_PAGE_SIZE, after);
      if (page === null) return new Failure(StorageRemoveError.RemoveFailed);

      if (!(await removeByBucket(page.objects))) {
        return new Failure(StorageRemoveError.RemoveFailed);
      }

      if (!(await forgetObjects(page.objects.map((object) => object.path)))) {
        return new Failure(StorageRemoveError.IndexFailed);
      }

      if (!page.full) return okay;
      after = page.last ?? "";
    }
  }

  #leaf(
    name: string,
    spec: StorageMediaSpec,
  ): StorageResourceConfig<PathArgs<P>> {
    const leaf = pathSegment(name);
    this.#claim(leaf);
    declareStorage(`${this.path}/${leaf}`, this.visibility);

    const segments = this.#segments;
    return {
      visibility: this.visibility,
      extensions: spec.extensions,
      maxSize: spec.maxSize,
      path: (...args: PathArgs<P>) =>
        `${renderTemplate(segments, args)}/${leaf}`,
    };
  }

  #claim(segment: string): void {
    if (this.#taken.has(segment)) {
      throw new TypeError(
        `storage folder "${this.path}" declares "${segment}" twice, and one would hide the other.`,
      );
    }

    this.#taken.add(segment);
  }

  #prefixOf(args: PathArgs<P>): string | null {
    try {
      return renderTemplate(this.#segments, args);
    } catch (e) {
      if (e instanceof StoragePathError) return null;
      throw e;
    }
  }
}

function objectOf(row: StorageObjectRow): StorageObject {
  const visibility = row.visibility as StorageVisibility;

  return {
    path: row.path,
    url: objectUrl(row.path, visibility),
    visibility,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    blurHash: row.blur_hash,
    updatedAt: row.updated_at,
  };
}

async function removeByBucket(
  objects: readonly StorageObjectRow[],
): Promise<boolean> {
  const grouped = new Map<StorageVisibility, string[]>();

  for (const object of objects) {
    const visibility = object.visibility as StorageVisibility;
    const paths = grouped.get(visibility) ?? [];
    paths.push(object.path);
    grouped.set(visibility, paths);
  }

  for (const [visibility, paths] of grouped) {
    if (!(await bucketOf(visibility).remove(paths))) return false;
  }

  return true;
}
