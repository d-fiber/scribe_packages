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

import type {
  FileSystem,
  FileSystemDriver,
  FileSystemEntity,
  Future,
  List,
} from "@scribe/alchemy";
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

  /** Writes `bytes` at `path`, over whatever was there. */
  write(path: string, bytes: Uint8Array): Future<void> {
    return Deno.writeFile(path, bytes);
  }

  /** Writes `text` at `path` as UTF-8, over whatever was there. */
  writeText(path: string, text: string): Future<void> {
    return Deno.writeTextFile(path, text);
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

  /** What `path` is, or null when nothing is there. */
  async describe(path: string): Future<FileSystemEntity | null> {
    try {
      return await this.#describe(path, path.split("/").pop() ?? path);
    } catch (raised) {
      if (raised instanceof Deno.errors.NotFound) return null;
      throw raised;
    }
  }

  /** Removes what is at `path`, and everything under it when it is a directory. */
  remove(path: string): Future<void> {
    return Deno.remove(path, { recursive: true });
  }

  /** A file nothing else holds, which the caller owns and has to remove. */
  temporaryFile(): Future<string> {
    return Deno.makeTempFile();
  }

  /** A directory nothing else holds, which the caller owns and has to remove. */
  temporaryDirectory(): Future<string> {
    return Deno.makeTempDir();
  }

  async #describe(path: string, name: string): Future<FileSystemEntity> {
    const found = await Deno.stat(path);

    return {
      name,
      isFile: found.isFile,
      isDirectory: found.isDirectory,
      size: Bytes.of(found.size),
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
