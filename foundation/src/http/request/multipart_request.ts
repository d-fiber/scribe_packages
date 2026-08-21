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
import { BaseRequest } from "./base_request.ts";
import type { MultipartFile } from "./multipart_file.ts";

const _BOUNDARY_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'()+_,-./:=?";
const _BOUNDARY_LENGTH = 32;
const _ENCODER = new TextEncoder();

/**
 * A `multipart/form-data` request: named fields, and files.
 *
 * The boundary is drawn at finalize rather than at construction, from an alphabet the
 * specification allows, so a request built long before it is sent cannot end up carrying a
 * separator that some part of its own body happens to contain.
 */
export class MultipartRequest extends BaseRequest {
  /** The plain fields of the form. */
  readonly fields: Map<string, string> = new Map();

  /** The files of the form. */
  readonly files: MultipartFile[] = [];

  constructor(method: string, url: URL | string) {
    super(method, url);
  }

  /**
   * The length of the whole body, separators included.
   *
   * It is exact, which is what lets the header be set before a single byte is written.
   */
  override get contentLength(): number {
    const boundaryLength = _BOUNDARY_LENGTH + 2;
    let length = 0;

    for (const [name, value] of this.fields) {
      length += "--".length + boundaryLength + "\r\n".length +
        _byteLength(this.#fieldHeader(name)) +
        _byteLength(value) + "\r\n".length;
    }

    for (const file of this.files) {
      length += "--".length + boundaryLength + "\r\n".length +
        _byteLength(this.#fileHeader(file)) + file.length + "\r\n".length;
    }

    return length + "--".length + boundaryLength + "--\r\n".length;
  }

  override finalize(): ByteStream {
    const boundary = this.#drawBoundary();
    this.headers.set("content-type", `multipart/form-data; boundary=${boundary}`);
    super.finalize();

    const encoder = _ENCODER;
    const files = this.files;
    const fields = this.fields;
    const fieldHeader = (name: string) => this.#fieldHeader(name);
    const fileHeader = (file: MultipartFile) => this.#fileHeader(file);

    return new ByteStream(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          for (const [name, value] of fields) {
            controller.enqueue(encoder.encode(`--${boundary}\r\n${fieldHeader(name)}${value}\r\n`));
          }

          for (const file of files) {
            controller.enqueue(encoder.encode(`--${boundary}\r\n${fileHeader(file)}`));
            for await (const chunk of file.finalize().stream) controller.enqueue(chunk);
            controller.enqueue(encoder.encode("\r\n"));
          }

          controller.enqueue(encoder.encode(`--${boundary}--\r\n`));
          controller.close();
        },
      }),
    );
  }

  #fieldHeader(name: string): string {
    return `content-disposition: form-data; name="${_escape(name)}"\r\n\r\n`;
  }

  #fileHeader(file: MultipartFile): string {
    const name = file.filename === null ? "" : `; filename="${_escape(file.filename)}"`;

    return `content-type: ${file.contentType}\r\n` +
      `content-disposition: form-data; name="${_escape(file.field)}"${name}\r\n\r\n`;
  }

  #drawBoundary(): string {
    const drawn = new Uint8Array(_BOUNDARY_LENGTH);
    crypto.getRandomValues(drawn);

    let boundary = "scribe-boundary-";
    for (const byte of drawn) {
      boundary += _BOUNDARY_CHARS[byte % _BOUNDARY_CHARS.length];
    }
    return boundary.slice(0, _BOUNDARY_LENGTH + 2);
  }
}

/**
 * The size `value` takes on the wire, in bytes.
 *
 * A header is measured in bytes and not in characters: an accent in a field name or in a
 * filename takes two of them, and a content-length short by that much describes a body the
 * caller never sent.
 */
function _byteLength(value: string): number {
  return _ENCODER.encode(value).length;
}

/**
 * Percent-encodes what would otherwise end a header early.
 *
 * A quote or a newline inside a field name would close the header there and let the rest of
 * the name be read as one of our own directives.
 */
function _escape(value: string): string {
  return value.replace(/["\r\n]/g, (found) => ({ '"': "%22", "\r": "%0D", "\n": "%0A" })[found] ?? found);
}
