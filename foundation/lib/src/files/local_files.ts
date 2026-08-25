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

import type { FileSystem, FileSystemDriver, FileSystemEntity, Future, List } from "@scribe/alchemy";
import { Bytes } from "@scribe/alchemy";

/**
 * The disk this process runs on, as the port describes a file system.
 *
 * @remarks
 * It is the only file of this package that knows a disk exists, which is what lets a test put
 * something else behind the port without a byte being written. Every path is taken as it was
 * given: what a package may reach is a deployment's business, decided by what the process was
 * allowed to open, not by a check this class could make and a caller could work around.
 */
export class LocalFiles implements FileSystem {
  /** The bytes at `path`. */
  read(path: string): Future<Uint8Array> {
    return Deno.readFile(path);
  }

  /** The text at `path`, read as UTF-8. */
  readText(path: string): Future<string> {
    return Deno.readTextFile(path);
  }

  /** Writes `bytes` at `path`, over whatever was there, making the directories above it. */
  async write(path: string, bytes: Uint8Array): Future<void> {
    await this.#roomFor(path);
    await Deno.writeFile(path, bytes);
  }

  /** Writes `text` at `path` as UTF-8, over whatever was there, making the directories above it. */
  async writeText(path: string, text: string): Future<void> {
    await this.#roomFor(path);
    await Deno.writeTextFile(path, text);
  }

  /** Makes the directory at `path`, and the ones above it that are missing. */
  makeDirectory(path: string): Future<void> {
    return Deno.mkdir(path, { recursive: true });
  }

  /** What `path` holds, one entry per name, in the order the platform answers them. */
  async list(path: string): Future<List<FileSystemEntity>> {
    const found: FileSystemEntity[] = [];

    for await (const entry of Deno.readDir(path)) {
      found.push(await this.#describe(`${path}/${entry.name}`, entry.name));
    }

    return found;
  }

  /**
   * What `path` is, or null when nothing is there.
   *
   * @remarks
   * A path that reaches through a file, such as `report.txt/page`, names nothing either, and the
   * platform says so with its own error rather than the one it uses for a missing name. Both are
   * the same answer to the caller: there is nothing at that path.
   */
  async describe(path: string): Future<FileSystemEntity | null> {
    try {
      return await this.#describe(path, _lastSegment(path));
    } catch (raised) {
      if (_namesNothing(raised)) return null;
      throw raised;
    }
  }

  /**
   * Removes what is at `path`, and everything under it when it is a directory.
   *
   * @remarks
   * A path that holds nothing is already in the state this asks for, so it answers rather than
   * raising. The port says so, and a caller that had to look first would be racing whoever else
   * is writing there.
   */
  async remove(path: string): Future<void> {
    try {
      await Deno.remove(path, { recursive: true });
    } catch (raised) {
      if (!_namesNothing(raised)) throw raised;
    }
  }

  /** A file nothing else holds, which the caller owns and has to remove. */
  temporaryFile(): Future<string> {
    return Deno.makeTempFile();
  }

  /** A directory nothing else holds, which the caller owns and has to remove. */
  temporaryDirectory(): Future<string> {
    return Deno.makeTempDir();
  }

  /**
   * Makes the directories `path` needs above it, and does nothing when they are already there.
   *
   * @remarks
   * The port promises a write makes room for itself, and a caller that has to make the directory
   * first has to know whether it exists, which is a second call and a race between the two. A
   * path with no directory above it is the common case and costs one call that answers at once.
   */
  async #roomFor(path: string): Future<void> {
    const above = path.slice(0, path.lastIndexOf("/"));
    if (above === "" || above === path) return;

    await Deno.mkdir(above, { recursive: true });
  }

  /**
   * What the platform says about `path`, under the `name` the caller asked it by.
   *
   * @remarks
   * The size of a directory is answered as zero rather than what the platform reports. A
   * directory holds names, not bytes, and every file system sizes its own bookkeeping
   * differently: 64 on one, 4096 on another, 0 on a third, for the same two entries.
   */
  async #describe(path: string, name: string): Future<FileSystemEntity> {
    const found = await Deno.stat(path);

    return {
      name,
      isFile: found.isFile,
      isDirectory: found.isDirectory,
      size: Bytes.of(found.isDirectory ? 0 : found.size),
    };
  }
}

/**
 * What opens the disk for a package that asked the port for one.
 *
 * @remarks
 * One instance answers every ask, because nothing is held: a file system is a set of calls on
 * the platform, and two of them would be the same disk under two names.
 */
export class LocalFileSystems implements FileSystemDriver {
  readonly #opened = new LocalFiles();

  /** The disk this process runs on. */
  open(): FileSystem {
    return this.#opened;
  }
}

/**
 * The name a path is known by, ignoring the separators it was written with.
 *
 * @remarks
 * A trailing slash names the same directory, so `held/` is `held` and not the empty name between
 * the last slash and the end.
 */
function _lastSegment(path: string): string {
  const named = path.split("/").filter((segment) => segment.length > 0).pop();
  return named ?? path;
}

/**
 * Whether the platform is saying there is nothing at the path that was asked about.
 *
 * @remarks
 * A missing name and a path reaching through a file are two errors on the platform and one answer
 * here. `NotADirectory` has no class of its own, so it is read from the name the runtime gives it.
 */
function _namesNothing(raised: unknown): boolean {
  return raised instanceof Deno.errors.NotFound ||
    (raised instanceof Error && raised.name === "NotADirectory");
}
