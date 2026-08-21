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

import { ByteStream } from "../byte_stream.ts";

/** One file inside a {@link MultipartRequest}. */
export class MultipartFile {
  /** The form field this file is sent under. */
  readonly field: string;

  /** How many bytes the file holds. */
  readonly length: number;

  /** The name the server is told, or `null` to send none. */
  readonly filename: string | null;

  /** The media type the server is told. */
  readonly contentType: string;

  readonly #stream: ByteStream;
  #finalized = false;

  constructor(
    field: string,
    stream: ByteStream,
    length: number,
    options: { filename?: string | null; contentType?: string } = {},
  ) {
    this.field = field;
    this.length = length;
    this.filename = options.filename ?? null;
    this.contentType = options.contentType ?? "application/octet-stream";
    this.#stream = stream;
  }

  /** A file made of bytes already in hand. */
  static fromBytes(
    field: string,
    bytes: Uint8Array,
    options: { filename?: string | null; contentType?: string } = {},
  ): MultipartFile {
    return new MultipartFile(field, ByteStream.fromBytes(bytes), bytes.length, options);
  }

  /** A file made of text, encoded utf-8. */
  static fromString(
    field: string,
    value: string,
    options: { filename?: string | null; contentType?: string } = {},
  ): MultipartFile {
    const bytes = new TextEncoder().encode(value);
    return MultipartFile.fromBytes(field, bytes, {
      contentType: "text/plain; charset=utf-8",
      ...options,
    });
  }

  /** Hands the bytes over, once. */
  finalize(): ByteStream {
    if (this.#finalized) {
      throw new Error("Can't finalize a finalized MultipartFile.");
    }
    this.#finalized = true;
    return this.#stream;
  }
}
